import { action, DialRotateEvent, DialUpEvent, KeyDownEvent, SingletonAction, TouchTapEvent, WillAppearEvent } from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// Throttle time in milliseconds
const THROTTLE_TIME = 50;

/**
 * Action that controls Spotify volume using a dial on the Stream Deck Plus.
 * Uses AppleScript to interact with the local Spotify application.
 */
@action({ UUID: "com.oren-teich.spotify-sdp.volume" })
export class SpotifyVolume extends SingletonAction<SpotifyVolumeSettings> {
    // Timestamp of the last volume change
    private lastVolumeChangeTime = 0;
    
    // Target volume (for smooth transitions)
    private targetVolume: number | null = null;
    
    // Pending volume update timeout
    private volumeUpdateTimeout: NodeJS.Timeout | null = null;
    
    /**
     * When the action appears, get the current Spotify volume and display it.
     */
    override async onWillAppear(ev: WillAppearEvent<SpotifyVolumeSettings>): Promise<void> {
        try {
            streamDeck.logger.info("SpotifyVolume action appearing");
            
            // Check if Spotify is running
            const isRunning = await this.isSpotifyRunning();
            if (!isRunning) {
                streamDeck.logger.warn("Spotify is not running");
                await ev.action.setTitle("Spotify\nNot Running");
                return;
            }

            // Get current volume
            const volume = await this.getSpotifyVolume();
            streamDeck.logger.info(`Current Spotify volume: ${volume}%`);
            
            // Update settings
            const settings = ev.payload.settings || {};
            settings.volume = volume;
            await ev.action.setSettings(settings);
            
            // Update display
            await this.updateDisplay(ev.action, volume);
        } catch (error) {
            streamDeck.logger.error(`Error in onWillAppear: ${error}`);
            await ev.action.setTitle("Error");
        }
    }
    
    /**
     * Handle dial up events to toggle mute/unmute.
     */
    override async onDialUp(ev: DialUpEvent<SpotifyVolumeSettings>): Promise<void> {
        try {
            streamDeck.logger.info("Dial up event received");
            
            // Check if Spotify is running
            const isRunning = await this.isSpotifyRunning();
            if (!isRunning) {
                streamDeck.logger.warn("Spotify is not running");
                await ev.action.setTitle("Spotify\nNot Running");
                return;
            }

            // Toggle mute/unmute
            await this.toggleMute();
            
            // Update volume display
            const volume = await this.getSpotifyVolume();
            const settings = ev.payload.settings || {};
            settings.volume = volume;
            await ev.action.setSettings(settings);
            await this.updateDisplay(ev.action, volume);
        } catch (error) {
            streamDeck.logger.error(`Error in onDialUp: ${error}`);
            await ev.action.setTitle("Error");
        }
    }
    
    /**
     * Handle touch tap events on the touchscreen to toggle mute/unmute.
     */
    override async onTouchTap(ev: TouchTapEvent<SpotifyVolumeSettings>): Promise<void> {
        try {
            streamDeck.logger.info("Touch tap event received");
            
            // Check if Spotify is running
            const isRunning = await this.isSpotifyRunning();
            if (!isRunning) {
                streamDeck.logger.warn("Spotify is not running");
                await ev.action.setTitle("Spotify\nNot Running");
                return;
            }

            // Toggle mute/unmute
            await this.toggleMute();
            
            // Update volume display
            const volume = await this.getSpotifyVolume();
            const settings = ev.payload.settings || {};
            settings.volume = volume;
            await ev.action.setSettings(settings);
            await this.updateDisplay(ev.action, volume);
        } catch (error) {
            streamDeck.logger.error(`Error in onTouchTap: ${error}`);
            await ev.action.setTitle("Error");
        }
    }

    /**
     * Handle dial rotation events to adjust Spotify volume.
     * Implements throttling and smooth transitions for fast rotations.
     */
    override async onDialRotate(ev: DialRotateEvent<SpotifyVolumeSettings>): Promise<void> {
        try {
            streamDeck.logger.debug(`Dial rotate event received: ${ev.payload.ticks} ticks`);
            
            // Check if Spotify is running
            const isRunning = await this.isSpotifyRunning();
            if (!isRunning) {
                streamDeck.logger.warn("Spotify is not running");
                await ev.action.setTitle("Spotify\nNot Running");
                return;
            }

            // Get current volume from settings or fetch it
            let currentVolume = ev.payload.settings?.volume;
            if (currentVolume === undefined) {
                currentVolume = await this.getSpotifyVolume();
            }

            // Calculate new volume based on rotation
            // For fast rotations, reduce sensitivity to prevent large jumps
            // The faster the rotation (higher ticks), the less sensitive we make it
            const tickMagnitude = Math.abs(ev.payload.ticks);
            const sensitivity = tickMagnitude > 5 ? 1 : tickMagnitude > 2 ? 1.5 : 2;
            const volumeChange = Math.round(ev.payload.ticks * sensitivity);
            
            let newVolume = Math.max(0, Math.min(100, currentVolume + volumeChange));
            streamDeck.logger.debug(`Adjusting volume from ${currentVolume}% to ${newVolume}%`);
            
            // Update the target volume
            this.targetVolume = newVolume;
            
            // Update the display immediately to provide visual feedback
            const settings = ev.payload.settings || {};
            settings.volume = newVolume;
            await ev.action.setSettings(settings);
            await this.updateDisplay(ev.action, newVolume);
            
            // Throttle the actual volume changes to prevent overwhelming the Spotify app
            const now = Date.now();
            if (now - this.lastVolumeChangeTime >= THROTTLE_TIME) {
                // It's been long enough since the last change, update immediately
                await this.setSpotifyVolume(newVolume);
                this.lastVolumeChangeTime = now;
            } else if (this.volumeUpdateTimeout === null) {
                // Schedule a delayed update
                this.volumeUpdateTimeout = setTimeout(async () => {
                    if (this.targetVolume !== null) {
                        streamDeck.logger.debug(`Applying delayed volume change to ${this.targetVolume}%`);
                        await this.setSpotifyVolume(this.targetVolume);
                        this.lastVolumeChangeTime = Date.now();
                        this.targetVolume = null;
                    }
                    this.volumeUpdateTimeout = null;
                }, THROTTLE_TIME);
            }
            // If there's already a pending update, we don't need to schedule another one
            // The pending update will use the latest targetVolume
            
        } catch (error) {
            streamDeck.logger.error(`Error in onDialRotate: ${error}`);
            await ev.action.setTitle("Error");
        }
    }

    /**
     * Update the display with the current volume.
     * Uses the built-in $B1 layout to show the title, icon, volume percentage, and volume bar.
     */
    private async updateDisplay(action: any, volume: number): Promise<void> {
        // Update the volume text in the built-in layout
        // Format to match system volume display
        const volumeText = `${volume}%`;
        
        // Determine which icon to use based on volume
        const iconPath = volume === 0 
            ? "imgs/actions/spotify-volume/volume-muted" 
            : "imgs/actions/spotify-volume/volume";
        
        streamDeck.logger.info(`Setting volume display: Spotify Volume, ${volumeText}, Bar: ${volume}, Icon: ${iconPath}`);
        
        try {
            // First, explicitly set the layout
            await action.setFeedbackLayout("$B1");
            streamDeck.logger.info("Layout set successfully");
            
            // Set the image directly for the action
            await action.setImage(iconPath);
            streamDeck.logger.info("Image set successfully");
            
            // Set feedback to update the value and indicator in the built-in $B1 layout
            await action.setFeedback({
                title: "Spotify Volume",
                value: volumeText,
                indicator: volume, // The bar value should be the numeric volume (0-100)
                icon: iconPath // Add the volume icon using the correct property name
            });
            streamDeck.logger.info("Feedback set successfully");
            
            // Also set the title for compatibility with other Stream Deck devices
            await action.setTitle(`Spotify Volume`);
        } catch (error) {
            streamDeck.logger.error(`Error updating display: ${error}`);
        }
    }

    /**
     * Check if Spotify is running using AppleScript.
     */
    private async isSpotifyRunning(): Promise<boolean> {
        try {
            const script = 'osascript -e "application \\"Spotify\\" is running"';
            const { stdout } = await execPromise(script);
            return stdout.trim() === "true";
        } catch (error) {
            return false;
        }
    }

    /**
     * Get the current Spotify volume using AppleScript.
     */
    private async getSpotifyVolume(): Promise<number> {
        try {
            const script = 'osascript -e "tell application \\"Spotify\\" to get sound volume"';
            const { stdout } = await execPromise(script);
            return parseInt(stdout.trim(), 10);
        } catch (error) {
            streamDeck.logger.error(`Error getting Spotify volume: ${error}`);
            throw error;
        }
    }

    /**
     * Set the Spotify volume using AppleScript.
     */
    private async setSpotifyVolume(volume: number): Promise<void> {
        try {
            const script = `osascript -e "tell application \\"Spotify\\" to set sound volume to ${volume}"`;
            await execPromise(script);
        } catch (error) {
            streamDeck.logger.error(`Error setting Spotify volume: ${error}`);
            throw error;
        }
    }
    
    /**
     * Toggle play/pause in Spotify using AppleScript.
     */
    private async togglePlayPause(): Promise<void> {
        try {
            const script = 'osascript -e "tell application \\"Spotify\\" to playpause"';
            await execPromise(script);
            streamDeck.logger.info("Toggled Spotify play/pause");
        } catch (error) {
            streamDeck.logger.error(`Error toggling play/pause: ${error}`);
            throw error;
        }
    }
    
    // Store the previous volume for mute/unmute functionality
    private previousVolume: number = 50;
    
    /**
     * Toggle mute/unmute in Spotify by saving current volume and setting to 0, or restoring previous volume.
     */
    private async toggleMute(): Promise<void> {
        try {
            // Get current volume
            const currentVolume = await this.getSpotifyVolume();
            
            // Check if we're already muted (volume is 0)
            if (currentVolume === 0) {
                // We're muted, restore previous volume or default to 50%
                await this.setSpotifyVolume(this.previousVolume);
                streamDeck.logger.info(`Unmuted Spotify (volume restored to ${this.previousVolume}%)`);
            } else {
                // We're not muted, save current volume and mute
                this.previousVolume = currentVolume;
                await this.setSpotifyVolume(0);
                streamDeck.logger.info(`Muted Spotify (previous volume was ${currentVolume}%)`);
            }
        } catch (error) {
            streamDeck.logger.error(`Error toggling mute: ${error}`);
            throw error;
        }
    }
}

/**
 * Settings for {@link SpotifyVolume}.
 */
type SpotifyVolumeSettings = {
    volume?: number;
    previousVolume?: number;
};
