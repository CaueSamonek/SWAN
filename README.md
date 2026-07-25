# SWAN

**SWAN** (**S**imple **W**hatsApp **A**PI for **N**ode) is a lightweight wrapper around the Baileys library that provides a simpler and more intuitive interface for building WhatsApp bots in Node.js.



## Features

- Simple socket management with automatic reconnection.
- QR code authentication.
- Easy message sending.
- Built-in reply support.
- Media download and upload.
- Sticker creation from images and videos.
- Convenient wrappers for contacts, chats and messages.
- Minimal API with no unnecessary abstractions.

## Installation

```bash
npm install swan-api
```
## Usage

### Basic bot

```javascript
import {Socket} from "swan-api";

const socket = new Socket();

socket.on("ready", () => console.log('Socket Ready!'))

socket.on("newMessage", async (msg) => {
    if (msg.text.toLowerCase() === "ping")
        await msg.reply("pong!");
});
```

### Media and message handling

```javascript
import {Socket, MessageMedia} from "swan-api";

const socket = new Socket();

socket.on("ready", () => {
    console.log("Bot connected!");
});

socket.on("newMessage", async (msg) => {
    // Avoids infinite loop
    if (msg.fromMe)
        return;

    console.log(`Message from ${msg.author}: ${msg.text}`);

    await msg.reply("Processing your message...");

    // If an image was sent, sends it back as a sticker
    const media = await msg.downloadMedia();
    if (media)
        await msg.reply(media, {asSticker: true});
});
```

## API

### Socket

Creates and manages the WhatsApp connection.

```javascript
const socket = new Socket();
```

#### Events

| Event | Description |
| ------ | ----------- |
| `ready` | Fired after a successful connection. |
| `newMessage` | Fired whenever a new message is received. |

### Message

Represents a received WhatsApp message.

#### Properties

| Property | Description |
| -------- | ----------- |
| `text` | Message text. |
| `type` | Message type. |
| `fromId` | Chat JID. |
| `fromName` | Sender push name. |
| `fromMe` | Whether the message was sent by the current user. |
| `author` | Sender JID. |
| `media` | Attached media information, if any. |
| `quoted` | Quoted `Message`, if present. |

#### Methods

##### `reply(content, options?)`

Replies to the current message.

```javascript
await msg.reply("Hi!");
```

##### `send(content, options?)`

Sends a message to the current chat.

```javascript
await msg.send("Hello everyone!");
```

##### `downloadMedia()`

Downloads the attached media.

```javascript
const media = await msg.downloadMedia();
```

##### `getContact()`

Returns sender information.

```javascript
const contact = await msg.getContact();

console.log(contact.name);
console.log(contact.number);
```

##### `getChat()`

Returns chat information.

```javascript
const chat = await msg.getChat();

console.log(chat.name);
console.log(chat.isGroup);
```

---

### MessageMedia

Represents a media file.

#### Static methods

##### `MessageMedia.fromFile(path)`

```javascript
const media = MessageMedia.fromFile("./photo.jpg");
```

##### `MessageMedia.fromUrl(url)`

```javascript
const media = await MessageMedia.fromUrl("https://example.com/image.png");
```

---

## Exports

```javascript
import {  
    Socket,
    Message,
    MessageMedia
} from "swan-api";
```

## License

MIT
