import { Observable } from "rxjs";
import type { Characteristic } from "./types";
import { log } from "@ledgerhq/logs";

export const monitorCharacteristic = (characteristic: Characteristic): Observable<Buffer> =>
  new Observable(o => {
    log("ble-verbose", "start monitor " + characteristic.uuid);

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
      log("ble-verbose", "end monitor " + characteristic.uuid);
      characteristic.removeEventListener("characteristicvaluechanged", onCharacteristicValueChanged);
      if (characteristic?.service?.device?.gatt.connected) {
        characteristic.stopNotifications();
      }
    };
  });
