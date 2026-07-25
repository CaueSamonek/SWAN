import fs from 'fs'
import axios from 'axios'

import MessageMedia from './MessageMedia.js'
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

// Wrapper class for baileys API message object
export default class Message { 
    // each Message stores its socket, chat/user information and context
    constructor(socket, baileysMessage){
        // saves socket and original message object
        this.socket = socket;
        this.baileysMsg = baileysMessage;

        // simplify subsequent access
        const m = this.baileysMsg.message;
        const k = this.baileysMsg.key;

        // simplify and standardize attribute names
        this.fromId = k.remoteJid;
        this.fromMe = k.fromMe;
        this.author = k.participant || k.remoteJid;
        this.fromName = this.baileysMsg.pushName;
        this.type = Object.keys(m)[0].replace("Message","").toLowerCase() || 'conversation'        
        this.text = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';

        this.media = m.imageMessage || m.videoMessage || m.documentMessage || m.stickerMessage;
    
        // build the quoted message, if any
        this.quoted = null;
        const ctx = m.extendedTextMessage?.contextInfo;
        if (ctx?.quotedMessage){
            this.quoted = new Message(socket, {
                key: {remoteJid: this.fromId, fromMe: ctx.participant === socket.userId},
                message: ctx.quotedMessage
            });
        }
    }

    // Returns the attached media as a MessageMedia object, or null if none exists
    async downloadMedia() {
        if (!this.media) return null;
        const stream = await downloadContentFromMessage(this.media, this.type);

        const chunks = [];
        for await (const chunk of stream)
            chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        return new MessageMedia(buffer, this.media.mimetype);
    }

    // returns the sender's name and phone number
    async getContact() {
        const jid = this.fromMe ? this.socket.userId : this.author;
        const number = jid.split('@')[0];
        return {name: this.fromName, number}
    }

    // get chat name and if it is a group or not
    async getChat(){
        const isGroup = this.fromId.endsWith("@g.us");
        let name = this.fromName;

        if (isGroup) {
            const metadata = await this.socket.groupMetadata(this.fromId);
            name = metadata.subject;
        }

        return {name, isGroup}
    }

    // send message as a reply by adding 'quoted' in the options and call 'send()'
    async reply(content, options = {}){
        return this.send(content, {...options, quoted: this.baileysMsg})
    }

    // calls the socket's send function
    async send(content, options = {}){
        return this.socket.send(this.fromId, content, options)
    }
}
