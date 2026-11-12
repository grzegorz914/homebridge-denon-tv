// While the device cannot be reached every read of the accessory fails with a communication error, so the Home app shows the accessory
// as not responding and decides itself what to do with it. The plugin does not pretend any state of the device.
export const applyReachability = (accessory, hap, isReachable) => {
    for (const service of accessory.services) {
        for (const characteristic of service.characteristics) {
            const handler = characteristic.getHandler;
            if (typeof handler !== 'function') continue;

            characteristic.getHandler = async (...args) => {
                if (!isReachable()) throw new hap.HapStatusError(hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
                return handler.apply(characteristic, args);
            };
        }
    }
};

const CONNECTION_ERROR_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EHOSTUNREACH', 'EHOSTDOWN', 'ENETUNREACH', 'ENETDOWN', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'];

// Any failed request without an HTTP answer means that the device cannot be reached, a parse error of an answer is not one of them.
// The error is checked together with its causes, because the plugin wraps the original error
export const isConnectionError = (error) => {
    for (let e = error; e; e = e.cause) {
        if (e.response) return false;
        if (e.isAxiosError || CONNECTION_ERROR_CODES.includes(e.code) || /timeout|socket hang up|EHOST|ENET/i.test(e.message ?? '')) return true;
    }
    return false;
};
