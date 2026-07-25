import fs from 'fs'
import axios from 'axios'
import mime from 'mime-types'

// Wrapper for media content
export default class MessageMedia {
    // stores data and mimetype
    constructor(data, mimetype) {
        this.data = data
        this.mimetype = mimetype;
    }

    // Creates MessageMedia from a local file
    static fromFile(path) {
        const buffer = fs.readFileSync(path)
        const mimetype = mime.lookup(path);
        return new MessageMedia(buffer, mimetype)
    }

    // Creates MessageMedia from a URL (must point to a valid media file)
    static async fromUrl(url) {
        const res = await axios.get(url, { responseType: 'arraybuffer' })
        return new MessageMedia(Buffer.from(res.data), res.headers['content-type'])
    }
}
