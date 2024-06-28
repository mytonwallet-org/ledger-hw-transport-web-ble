"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorCharacteristic = void 0;
const rxjs_1 = require("rxjs");
const logs_1 = require("@ledgerhq/logs");
const monitorCharacteristic = (characteristic) => new rxjs_1.Observable(o => {
    (0, logs_1.log)("ble-verbose", "start monitor " + characteristic.uuid);
    function onCharacteristicValueChanged(event) {
        const characteristic = event.target;
        if (characteristic.value) {
            o.next(Buffer.from(characteristic.value.buffer));
        }
    }
    characteristic.startNotifications()
        .then(() => {
        characteristic.addEventListener("characteristicvaluechanged", onCharacteristicValueChanged);
    })
        .catch(error => {
        o.error(error);
    });
    return () => {
        (0, logs_1.log)("ble-verbose", "end monitor " + characteristic.uuid);
        characteristic.removeEventListener("characteristicvaluechanged", onCharacteristicValueChanged);
        characteristic.stopNotifications();
    };
});
exports.monitorCharacteristic = monitorCharacteristic;
//# sourceMappingURL=monitorCharacteristic.js.map