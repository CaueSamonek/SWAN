import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys'

import P from 'pino'
import qrcode from 'qrcode-terminal'
import { EventEmitter } from "node:events";

import fs from "node:fs/promises";


import Sticker from './Sticker.js'
import Message from './Message.js';
import MessageMedia from './MessageMedia.js';

//Wrapper Class For Baileys Socket
export default class Socket extends EventEmitter {
    constructor(){
        super();
        this.muteSessionErrors()
        this.connect()
    }

    // hide internal session errors that does not affect the use
    muteSessionErrors(){
        const oldLog = console.log;
        console.log = (...args) => {
            if (String(args[0]).includes("Closing session"))
                return;

            oldLog(...args);
        };

        const oldError = console.error;
        console.error = (...args) => {
            if (
                String(args[0]).includes("Failed to decrypt") ||
                String(args[0]).includes("Session error")
            )
                return;

            oldError(...args);
        };
    }

    // creates a Socket instance and tries to authenticate
    async connect() {
        await this.authenticate();
        this.bindEvents();
    }

    //creates new baileys socket and authenticate
    async authenticate(){
        const { state, saveCreds } = await useMultiFileAuthState('auth')
        const { version } = await fetchLatestBaileysVersion()
        const logger = P({level: 'silent'})

        this.socket = makeWASocket({version, auth: state, logger});
        this.socket.ev.on('creds.update', saveCreds)
    }

    //bind events from baileys to default treatment functions
    bindEvents(){
        let socketReady = false

        //each new message emits a 'newMessage' event and a 'Message' object
        this.socket.ev.on('messages.upsert', ({messages}) => {
            if (!socketReady)
                return;

            for (const msg of messages){
                if (!msg.message)
                    continue;
                this.emit("newMessage", new Message(this, msg));
            }
        });
        
        //emits 'ready' when opens connection
        //on connnection lost, tries to reconnect
        this.socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr)
                qrcode.generate(qr, {small: true})

            if (connection == "close"){
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode
                                                    !== DisconnectReason.loggedOut;
                if (shouldReconnect)
                    await this.connect()
            } else if (connection == 'open'){
                socketReady = true
                this.userId = this.socket.user.id;
                this.emit('ready');
            }
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
            // WhatsApp limits: 100KB for static stickers, 500KB for animated ones
            const isAnimated = mimetype.startsWith("video/");
            const maxBytes = (isAnimated ? 500 : 100) * 1024;

            // tries to create the sticker at the highest quality,
            // if the resulting file exceeds WhatsApp's 1MB limit
            // the quality is reduced by 10% and retried
            // throws an exception if quality goes below 0%
            let final_quality = 100;
            while (final_quality > 0) {
                const webp = await Sticker(buffer, {...opts,
                                                stickerQuality : final_quality})

                if (webp.length > maxBytes)
                    final_quality -= 10;
                else
                    return await this.socket.sendMessage(jid, {sticker: webp}, opts)
            }

            throw new Error(`SWAN send(): could not compress sticker below ${maxBytes / 1024}KB`);
        }

        //send regular files
        for (const type of ['image', 'video', 'application'])
             if (mimetype.startsWith(`${type}/`))
                 return this.socket.sendMessage(jid, {[type]: buffer, mimetype}, opts)
    }
}
