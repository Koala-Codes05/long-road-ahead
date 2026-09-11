/**
 * YouTubeMusicPlayer — YouTube IFrame API Background Music Manager
 * Features:
 *  - Dynamic script loading for YouTube IFrame Player API
 *  - Hidden offscreen iframe rendering for seamless audio playback
 *  - Default Synthwave / Driving Chill Beats playlist
 *  - Custom Playlist / Video URL loader (parsing YouTube links)
 *  - Smooth Volume, Track Navigation (Next/Prev), Play/Pause & Mute
 *  - UI callback hooks for track info & play state
 */
export class YouTubeMusicPlayer {
    constructor(options = {}) {
        this.containerId = options.containerId || 'yt-player-container';
        this.defaultPlaylistId = options.defaultPlaylistId || 'PLw-VjHDlEOgs658kAHR_LAaILBXb-s6Q5'; // Synthwave / Chillwave Driving Beats
        this.volume = options.initialVolume !== undefined ? options.initialVolume : 50;
        this.isMuted = false;
        this.isPlaying = false;
        this.isReady = false;
        this.currentTrackTitle = 'Loading Music Engine...';
        this.player = null;
        this.onStateChangeCallback = options.onStateChange || null;
        this.onTrackChangeCallback = options.onTrackChange || null;

        this._initContainer();
        this._loadYouTubeAPI();
    }

    _initContainer() {
        let container = document.getElementById(this.containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = this.containerId;
            // Position offscreen so iframe is created & active without taking visual space
            container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
            document.body.appendChild(container);
        }
    }

    _loadYouTubeAPI() {
        if (window.YT && window.YT.Player) {
            this._createPlayer();
            return;
        }

        // Setup global callback for YouTube API ready event
        const previousReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof previousReady === 'function') previousReady();
            this._createPlayer();
        };

        // Inject script if not already present
        if (!document.getElementById('yt-iframe-api-script')) {
            const script = document.createElement('script');
            script.id = 'yt-iframe-api-script';
            script.src = 'https://www.youtube.com/iframe_api';
            script.onerror = () => {
                console.warn('⚠️ YouTube IFrame API script failed to load (blocked by extension or offline).');
                this.currentTrackTitle = 'YOUTUBE RADIO (OFFLINE / ADBLOCK)';
                if (this.onTrackChangeCallback) this.onTrackChangeCallback(this.currentTrackTitle);
            };
            const firstScript = document.getElementsByTagName('script')[0];
            if (firstScript && firstScript.parentNode) {
                firstScript.parentNode.insertBefore(script, firstScript);
            } else {
                document.head.appendChild(script);
            }
        }
    }

    _createPlayer() {
        if (this.player) return;

        try {
            this.player = new window.YT.Player(this.containerId, {
                height: '100',
                width: '100',
                playerVars: {
                    listType: 'playlist',
                    list: this.defaultPlaylistId,
                    autoplay: 0,
                    controls: 0,
                    disablekb: 1,
                    fs: 0,
                    modestbranding: 1,
                    rel: 0,
                    playsinline: 1,
                },
                events: {
                    onReady: (event) => this._onPlayerReady(event),
                    onStateChange: (event) => this._onPlayerStateChange(event),
                    onError: (event) => this._onPlayerError(event),
                },
            });
        } catch (err) {
            console.warn('⚠️ Could not initialize YouTube Player:', err);
            this.currentTrackTitle = 'YouTube API unavailable';
            if (this.onTrackChangeCallback) this.onTrackChangeCallback(this.currentTrackTitle);
        }
    }

    _onPlayerReady(event) {
        this.isReady = true;
        this.errorCount = 0;
        console.log('🎵 YouTube Background Music Engine initialized & ready!');
        this.player.setVolume(this.volume);

        // Fetch current video title if available
        this._updateTrackInfo();
    }

    _onPlayerStateChange(event) {
        // window.YT.PlayerState: UNSTARTED (-1), ENDED (0), PLAYING (1), PAUSED (2), BUFFERING (3), CUED (5)
        const state = event.data;
        if (state === window.YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.errorCount = 0; // Reset error counter on successful playback
            this._updateTrackInfo();
        } else if (state === window.YT.PlayerState.PAUSED || state === window.YT.PlayerState.ENDED) {
            this.isPlaying = false;
        }

        if (this.onStateChangeCallback) {
            this.onStateChangeCallback(this.isPlaying);
        }
    }

    _onPlayerError(event) {
        console.warn('YouTube Player encountered an error code:', event.data);
        this.errorCount = (this.errorCount || 0) + 1;

        if (this.errorCount > 3) {
            console.warn('🛑 Reached YouTube Player max error retries. Disabling auto-next.');
            this.currentTrackTitle = 'YOUTUBE MUSIC (BLOCKED / UNPLAYABLE)';
            if (this.onTrackChangeCallback) this.onTrackChangeCallback(this.currentTrackTitle);
            return;
        }

        // Automatically attempt next track up to 3 times on video error
        if (this.isReady && this.player && typeof this.player.nextVideo === 'function') {
            setTimeout(() => {
                try {
                    if (this.errorCount <= 3 && this.player) {
                        this.player.nextVideo();
                    }
                } catch (e) {}
            }, 1500);
        }
    }

    _updateTrackInfo() {
        if (!this.player || typeof this.player.getVideoData !== 'function') return;

        try {
            const data = this.player.getVideoData();
            if (data && data.title) {
                this.currentTrackTitle = data.title;
            } else {
                this.currentTrackTitle = 'Synthwave Driving Mix';
            }
        } catch (e) {
            this.currentTrackTitle = 'Synthwave Driving Mix';
        }

        if (this.onTrackChangeCallback) {
            this.onTrackChangeCallback(this.currentTrackTitle);
        }
    }

    play() {
        if (!this.isReady || !this.player) return;
        try {
            this.player.playVideo();
            this.isPlaying = true;
        } catch (e) {}
    }

    pause() {
        if (!this.isReady || !this.player) return;
        try {
            this.player.pauseVideo();
            this.isPlaying = false;
        } catch (e) {}
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    nextTrack() {
        if (!this.isReady || !this.player) return;
        try {
            if (typeof this.player.nextVideo === 'function') {
                this.player.nextVideo();
            }
        } catch (e) {}
    }

    prevTrack() {
        if (!this.isReady || !this.player) return;
        try {
            if (typeof this.player.previousVideo === 'function') {
                this.player.previousVideo();
            }
        } catch (e) {}
    }

    setVolume(val) {
        this.volume = Math.max(0, Math.min(100, val));
        if (this.isReady && this.player && typeof this.player.setVolume === 'function') {
            this.player.setVolume(this.volume);
        }
    }

    toggleMute() {
        if (!this.isReady || !this.player) return;
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.player.mute();
        } else {
            this.player.unMute();
        }
        return this.isMuted;
    }

    /**
     * Parse YouTube link or ID and load video or playlist
     * Accepts:
     *  - https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
     *  - https://www.youtube.com/playlist?list=PLAYLIST_ID
     *  - https://youtu.be/VIDEO_ID
     *  - Plain VIDEO_ID or PLAYLIST_ID string
     */
    loadFromUrlOrId(inputStr) {
        if (!inputStr || !this.isReady || !this.player) return false;
        const str = inputStr.trim();

        // 1. Check for Playlist ID parameter (list=PL...)
        const playlistMatch = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
        if (playlistMatch && playlistMatch[1]) {
            const playlistId = playlistMatch[1];
            console.log(`🎵 Loading custom YouTube Playlist: ${playlistId}`);
            this.player.loadPlaylist({
                listType: 'playlist',
                list: playlistId,
                index: 0,
                startSeconds: 0,
            });
            return true;
        }

        // 2. Check for Video ID parameter (v=...) or short URL (youtu.be/...)
        let videoId = null;
        const vMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
        const shortMatch = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);

        if (vMatch && vMatch[1]) {
            videoId = vMatch[1];
        } else if (shortMatch && shortMatch[1]) {
            videoId = shortMatch[1];
        } else if (str.length === 11 && !str.includes(' ')) {
            videoId = str; // Plain 11-char video ID
        }

        if (videoId) {
            console.log(`🎵 Loading custom YouTube Video ID: ${videoId}`);
            this.player.loadVideoById(videoId);
            return true;
        }

        // 3. Fallback: If starts with PL..., treat as playlist ID directly
        if (str.startsWith('PL') || str.startsWith('OLAK5uy_')) {
            console.log(`🎵 Loading custom YouTube Playlist ID: ${str}`);
            this.player.loadPlaylist({
                listType: 'playlist',
                list: str,
                index: 0,
            });
            return true;
        }

        console.warn('Could not parse valid YouTube Video or Playlist link:', str);
        return false;
    }
}
