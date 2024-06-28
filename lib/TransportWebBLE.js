"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable prefer-template */
const hw_transport_1 = __importDefault(require("@ledgerhq/hw-transport"));
const errors_1 = require("@ledgerhq/errors");
const devices_1 = require("@ledgerhq/devices");
const sendAPDU_1 = require("@ledgerhq/devices/ble/sendAPDU");
const receiveAPDU_1 = require("@ledgerhq/devices/ble/receiveAPDU");
const logs_1 = require("@ledgerhq/logs");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const monitorCharacteristic_1 = require("./monitorCharacteristic");
const requiresBluetooth = () => {
    // $FlowFixMe
    const { bluetooth } = navigator;
    if (typeof bluetooth === "undefined") {
        throw new Error("web bluetooth not supported");
    }
    return bluetooth;
};
const availability = () => new rxjs_1.Observable(observer => {
    const bluetooth = requiresBluetooth();
    const onAvailabilityChanged = e => {
        observer.next(e.value);
    };
    bluetooth.addEventListener("availabilitychanged", onAvailabilityChanged);
    let unsubscribed = false;
    bluetooth.getAvailability().then(available => {
        if (!unsubscribed) {
            observer.next(available);
        }
    });
    return () => {
        unsubscribed = true;
        bluetooth.removeEventListener("availabilitychanged", onAvailabilityChanged);
    };
});
const transportsCache = {};
const requestDeviceParam = () => ({
    filters: (0, devices_1.getBluetoothServiceUuids)().map(uuid => ({
        services: [uuid],
    })),
});
const retrieveService = (device) => __awaiter(void 0, void 0, void 0, function* () {
    if (!device.gatt)
        throw new Error("bluetooth gatt not found");
    const [service] = yield device.gatt.getPrimaryServices();
    if (!service)
        throw new Error("bluetooth service not found");
    const infos = (0, devices_1.getInfosForServiceUuid)(service.uuid);
    if (!infos)
        throw new Error("bluetooth service infos not found");
    return [service, infos];
});
function open(deviceOrId, needsReconnect) {
    return __awaiter(this, void 0, void 0, function* () {
        let device;
        if (typeof deviceOrId === "string") {
            if (transportsCache[deviceOrId]) {
                (0, logs_1.log)("ble-verbose", "Transport in cache, using that.");
                return transportsCache[deviceOrId];
            }
            const bluetooth = requiresBluetooth();
            // TODO instead we should "query" the device by its ID
            device = yield bluetooth.requestDevice(requestDeviceParam());
        }
        else {
            device = deviceOrId;
        }
        if (!device.gatt.connected) {
            (0, logs_1.log)("ble-verbose", "not connected. connecting...");
            yield device.gatt.connect();
        }
        const [service, infos] = yield retrieveService(device);
        const { deviceModel, writeUuid, notifyUuid } = infos;
        const [writeC, notifyC] = yield Promise.all([
            service.getCharacteristic(writeUuid),
            service.getCharacteristic(notifyUuid),
        ]);
        const notifyObservable = (0, monitorCharacteristic_1.monitorCharacteristic)(notifyC).pipe((0, operators_1.tap)(value => {
            (0, logs_1.log)("ble-frame", "<= " + value.toString("hex"));
        }), (0, operators_1.share)());
        const notif = notifyObservable.subscribe();
        const transport = new BluetoothTransport(device, writeC, notifyObservable, deviceModel);
        if (!device.gatt.connected) {
            throw new errors_1.DisconnectedDevice();
        }
        // eslint-disable-next-line require-atomic-updates
        transportsCache[transport.id] = transport;
        const onDisconnect = e => {
            console.log("onDisconnect!", e);
            delete transportsCache[transport.id];
            transport.notYetDisconnected = false;
            notif.unsubscribe();
            device.removeEventListener("gattserverdisconnected", onDisconnect);
            (0, logs_1.log)("ble-verbose", `BleTransport(${transport.id}) disconnected`);
            transport.emit("disconnect", e);
        };
        device.addEventListener("gattserverdisconnected", onDisconnect);
        const beforeMTUTime = Date.now();
        try {
            yield transport.inferMTU();
        }
        finally {
            const afterMTUTime = Date.now();
            // workaround for #279: we need to open() again if we come the first time here,
            // to make sure we do a disconnect() after the first pairing time
            // because of a firmware bug
            if (afterMTUTime - beforeMTUTime < 1000) {
                needsReconnect = false; // (optim) there is likely no new pairing done because mtu answer was fast.
            }
            if (needsReconnect) {
                yield device.gatt.disconnect();
                // necessary time for the bonding workaround
                yield new Promise(s => setTimeout(s, 4000));
            }
        }
        if (needsReconnect) {
            return open(device, false);
        }
        return transport;
    });
}
/**
 * react-native bluetooth BLE implementation
 * @example
 * import BluetoothTransport from "@ledgerhq/hw-transport-web-ble";
 */
class BluetoothTransport extends hw_transport_1.default {
    /**
     * Scan for Ledger Bluetooth devices.
     * On this web implementation, it only emits ONE device, the one that was selected in the UI (if any).
     */
    static listen(observer) {
        (0, logs_1.log)("ble-verbose", "listen...");
        let unsubscribed;
        const bluetooth = requiresBluetooth();
        bluetooth.requestDevice(requestDeviceParam()).then(device => {
            if (!unsubscribed) {
                observer.next({
                    type: "add",
                    descriptor: device,
                });
                observer.complete();
            }
        }, error => {
            observer.error(new errors_1.TransportOpenUserCancelled(error.message));
        });
        function unsubscribe() {
            unsubscribed = true;
        }
        return {
            unsubscribe,
        };
    }
    /**
     * open a bluetooth device.
     */
    static open(deviceOrId) {
        return __awaiter(this, void 0, void 0, function* () {
            return open(deviceOrId, true);
        });
    }
    constructor(device, writeCharacteristic, notifyObservable, deviceModel) {
        super();
        this.mtuSize = 20;
        this.notYetDisconnected = true;
        this.write = (buffer) => __awaiter(this, void 0, void 0, function* () {
            (0, logs_1.log)("ble-frame", "=> " + buffer.toString("hex"));
            yield this.writeCharacteristic.writeValue(buffer);
        });
        this.id = device.id;
        this.device = device;
        this.writeCharacteristic = writeCharacteristic;
        this.notifyObservable = notifyObservable;
        this.deviceModel = deviceModel;
        (0, logs_1.log)("ble-verbose", `BleTransport(${String(this.id)}) new instance`);
    }
    inferMTU() {
        return __awaiter(this, void 0, void 0, function* () {
            let mtu = 23;
            yield this.exchangeAtomicImpl(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    mtu =
                        (yield (0, rxjs_1.firstValueFrom)((0, rxjs_1.merge)(this.notifyObservable.pipe((0, operators_1.first)(buffer => buffer.readUInt8(0) === 0x08), (0, operators_1.map)(buffer => buffer.readUInt8(5))), (0, rxjs_1.defer)(() => (0, rxjs_1.from)(this.write(Buffer.from([0x08, 0, 0, 0, 0])))).pipe((0, operators_1.ignoreElements)())))) + 3;
                }
                catch (e) {
                    (0, logs_1.log)("ble-error", "inferMTU got " + String(e));
                    this.device.gatt.disconnect();
                    throw e;
                }
            }));
            if (mtu > 23) {
                const mtuSize = mtu - 3;
                (0, logs_1.log)("ble-verbose", `BleTransport(${String(this.id)}) mtu set to ${String(mtuSize)}`);
                this.mtuSize = mtuSize;
            }
            return this.mtuSize;
        });
    }
    /**
     * Exchange with the device using APDU protocol.
     * @param apdu
     * @returns a promise of apdu response
     */
    exchange(apdu) {
        return __awaiter(this, void 0, void 0, function* () {
            const b = yield this.exchangeAtomicImpl(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const msgIn = apdu.toString("hex");
                    (0, logs_1.log)("apdu", `=> ${msgIn}`);
                    const data = yield (0, rxjs_1.firstValueFrom)((0, rxjs_1.merge)(this.notifyObservable.pipe(receiveAPDU_1.receiveAPDU), (0, sendAPDU_1.sendAPDU)(this.write, apdu, this.mtuSize)));
                    const msgOut = data.toString("hex");
                    (0, logs_1.log)("apdu", `<= ${msgOut}`);
                    return data;
                }
                catch (e) {
                    (0, logs_1.log)("ble-error", "exchange got " + String(e));
                    if (this.notYetDisconnected) {
                        // in such case we will always disconnect because something is bad.
                        this.device.gatt.disconnect();
                    }
                    throw e;
                }
            }));
            return b;
        });
    }
    setScrambleKey() { }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.exchangeBusyPromise) {
                yield this.exchangeBusyPromise;
            }
        });
    }
}
_a = BluetoothTransport;
BluetoothTransport.isSupported = () => Promise.resolve()
    .then(requiresBluetooth)
    .then(() => true, () => false);
/**
 * observe event with { available: bool, type: string }
 * (available is generic, type is specific)
 * an event is emit once and then each time it changes
 */
BluetoothTransport.observeAvailability = (observer) => availability().subscribe(observer);
BluetoothTransport.list = () => Promise.resolve([]);
/**
 * globally disconnect a bluetooth device by its id.
 */
BluetoothTransport.disconnect = (id) => __awaiter(void 0, void 0, void 0, function* () {
    (0, logs_1.log)("ble-verbose", `user disconnect(${id})`);
    const transport = transportsCache[id];
    if (transport) {
        transport.device.gatt.disconnect();
    }
});
exports.default = BluetoothTransport;
//# sourceMappingURL=TransportWebBLE.js.map