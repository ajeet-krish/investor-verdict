class VendorUnavailable extends Error {
    constructor(message = "ElevenLabs voice SDK is not installed on this host.") {
        super(message);
        this.status = 502;
    }
}

export class Conversation {
    static async startSession() {
        throw new VendorUnavailable();
    }
}

export class ElevenLabsClient {
    constructor() {
        this.tokens = {
            singleUse: {
                create: async () => {
                    throw new VendorUnavailable();
                },
            },
        };
        this.textToSpeech = {
            stream: () => {
                throw new VendorUnavailable();
            },
        };
        this.conversationalAi = {
            conversations: {
                getSignedUrl: async () => {
                    throw new VendorUnavailable();
                },
            },
        };
    }
}
