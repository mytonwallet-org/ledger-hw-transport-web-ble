import Transport from "@ledgerhq/hw-transport";
import type { DeviceModel } from "@ledgerhq/devices";
import { Observable, Subscription } from "rxjs";
import type { Device, Characteristic } from "./types";
/**
 * react-native bluetooth BLE implementation
 * @example
 * import BluetoothTransport from "@ledgerhq/hw-transport-web-ble";
 */
export default class BluetoothTransport extends Transport {
    static isSupported: () => Promise<boolean>;
    /**
     * observe event with { available: bool, type: string }
     * (available is generic, type is specific)
     * an event is emit once and then each time it changes
     */
    static observeAvailability: (observer: any) => Subscription;
    static list: () => any;
    /**
     * Scan for Ledger Bluetooth devices.
     * On this web implementation, it only emits ONE device, the one that was selected in the UI (if any).
     */
    static listen(observer: any): {
        unsubscribe: () => void;
    };
    /**
     * open a bluetooth device.
     */
    static open(deviceOrId: Device | string): Promise<any>;
    /**
     * globally disconnect a bluetooth device by its id.
     */
    static disconnect: (id: any) => Promise<void>;
    id: string;
    device: Device;
    mtuSize: number;
    writeCharacteristic: Characteristic;
    notifyObservable: Observable<Buffer>;
    notYetDisconnected: boolean;
    deviceModel: DeviceModel;
    constructor(device: Device, writeCharacteristic: Characteristic, notifyObservable: Observable<any>, deviceModel: DeviceModel);
    inferMTU(): Promise<number>;
    /**
     * Exchange with the device using APDU protocol.
     * @param apdu
     * @returns a promise of apdu response
     */
    exchange(apdu: Buffer): Promise<Buffer>;
    setScrambleKey(): void;
    write: (buffer: Buffer) => Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=TransportWebBLE.d.ts.map