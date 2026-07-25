import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys'

import P from 'pino'
import qrcode from 'qrcode-terminal'
import { EventEmitter } from "node:events";
import { Sticker } from 'wa-sticker-formatter'

import Message from './Message.js';
import MessageMedia from './MessageMedia.js';

//Wrapper Class For Baileys Socket
export default class Socket extends EventEmitter {
    // creates a socket instance
    constructor() {
        super();
        this.connect();
    }

    // tries to authenticate and bind default events
    async connect() {
        await this.authenticate();
        this.bindEvents();
    }

    //creates new baileys socket and authenticate
    async authenticate(){
        const { state, saveCreds } = await useMultiFileAuthState('auth')
        const { version } = await fetchLatestBaileysVersion()

        this.socket = makeWASocket({version, auth: state, logger: P({level: 'silent'})});
        this.user = this.socket.user;
        this.socket.ev.on('creds.update', saveCreds)
    }

    //bind events from baileys to default treatment functions
    bindEvents(){
        //each new message emits a 'newMessage' event and a 'Message' object
        this.socket.ev.on('messages.upsert', ({messages}) => {
            for (const msg of messages){
                if (!msg.message)
                    continue;
                this.emit("newMessage", new Message(this, msg));
            }
        });
        
        //emits 'ready' when opens connection
        //on connnection lost, tries to reconnect
        this.socket.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr)
                qrcode.generate(qr, {small: true})

            if (connection == "close"){
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode
                                                    !== DisconnectReason.loggedOut;
                if (shouldReconnect)
                    this.connect();
            } else if (connection == 'open')
                this.emit('ready');
        });
    }


    // send message wrapper function
    async send(jid, content, opts = {}){
        // replies text messages directly
        if (typeof content === 'string')
            return this.socket.sendMessage(jid, {text: content}, opts)

        // from this point on 'content' must be 'MessageMedia'
        if (!(content instanceof MessageMedia))
            throw new Error(`SWAN send(): invalid content type: ${typeof(content)}`);

        // simplify data access
        const buffer = content.data
        const mimetype = content.mimetype
        
        // parse media for sticker creation
        if (opts.asSticker){
            const isVideo = mimetype?.startsWith('video') || mimetype === 'image/gif'
            // video proportion must be 'full' to not get corrupted frames
            if (isVideo)
                opts.stickerProportion = 'full'

            // tries to create the sticker at the highest quality,
            // if the resulting file exceeds WhatsApp's 1MB limit
            // the quality is reduced by 10% and retried
            // throws an exception if quality goes below 0%
            let final_quality = 1;
            while (final_quality >= 0) {
                const sticker = new Sticker(buffer, {
                    pack: opts.stickerName,
                    author: opts.stickerAuthor,
                    type: opts.stickerProportion,
                    quality: final_quality,
                });

                const webp = await sticker.toBuffer();
                const size = (webp.length/1024)/1024;
                if (size >= 1)
                    final_quality -= 0.1;
                else
                    return await this.socket.sendMessage(jid, {sticker: webp}, opts)
            }

        }

        //send regular files
        for (const type of ['image', 'video', 'application'])
             if (mimetype.startsWith(`${type}/`))
                 return this.socket.sendMessage(jid, {[type]: buffer, mimetype}, opts)
    }
}
