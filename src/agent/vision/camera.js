import { Viewer } from 'prismarine-viewer/viewer/lib/viewer.js';
import { WorldView } from 'prismarine-viewer/viewer/lib/worldView.js';
import { getBufferFromStream } from 'prismarine-viewer/viewer/lib/simpleUtils.js';

import THREE from 'three';
import { createCanvas } from 'node-canvas-webgl/lib/index.js';
import fs from 'fs/promises';
import { Vec3 } from 'vec3';
import { EventEmitter } from 'events';

import worker_threads from 'worker_threads';
global.Worker = worker_threads.Worker;


export class Camera extends EventEmitter {
    constructor (bot, fp) {
        super();
        this.bot = bot;
        this.fp = fp;
        this.viewDistance = 12;
        this.width = 800;
        this.height = 512;
        this.canvas = createCanvas(this.width, this.height);
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
        this.viewer = new Viewer(this.renderer);
        this._init().then(() => {
            this.emit('ready');
        })
    }
  
    async _init () {
        if (!this.bot.entity || !this.bot.entity.position) {
            console.warn('[Camera] bot.entity or bot.entity.position is undefined. Camera initialization aborted.');
            return;
        }
        const botPos = this.bot.entity.position;
        const height = this.bot.entity.height != null ? this.bot.entity.height : 1.8;
        const center = new Vec3(botPos.x, botPos.y + height, botPos.z);
        this.viewer.setVersion(this.bot.version);
        // Load world
        const worldView = new WorldView(this.bot.world, this.viewDistance, center);
        this.viewer.listen(worldView);
        worldView.listenToBot(this.bot);
        await worldView.init(center);
        this.worldView = worldView;
    }
  
    async capture() {
        if (!this.bot.entity || !this.bot.entity.position) {
            console.warn('[Camera] bot.entity or bot.entity.position is undefined. Capture aborted.');
            return null;
        }
        const height = this.bot.entity.height != null ? this.bot.entity.height : 1.8;
        const center = new Vec3(this.bot.entity.position.x, this.bot.entity.position.y + height, this.bot.entity.position.z);
        this.viewer.camera.position.set(center.x, center.y, center.z);
        await this.worldView.updatePosition(center);
        const yaw = this.bot.entity.yaw != null ? this.bot.entity.yaw : 0;
        const pitch = this.bot.entity.pitch != null ? this.bot.entity.pitch : 0;
        this.viewer.setFirstPersonCamera(this.bot.entity.position, yaw, pitch);
        this.viewer.update();
        this.renderer.render(this.viewer.scene, this.viewer.camera);

        const imageStream = this.canvas.createJPEGStream({
            bufsize: 4096,
            quality: 100,
            progressive: false
        });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot_${timestamp}`;

        const buf = await getBufferFromStream(imageStream);
        await this._ensureScreenshotDirectory();
        await fs.writeFile(`${this.fp}/${filename}.jpg`, buf);
        console.log('saved', filename + '.jpg');
        return filename + '.jpg';
    }

    async _ensureScreenshotDirectory() {
        let stats;
        try {
            stats = await fs.stat(this.fp);
        } catch (e) {
            if (!stats?.isDirectory()) {
                await fs.mkdir(this.fp);
            }
        }
    }
}
  
