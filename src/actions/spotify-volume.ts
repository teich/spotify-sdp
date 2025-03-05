import { action, DialRotateEvent, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
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
            // Check if Spotify is running
            const isRunning = await this.isSpotifyRunning();
            if (!isRunning) {
                await ev.action.setTitle("Spotify\nNot Running");
                return;
            }

            // Get current volume
            const volume = await this.getSpotifyVolume();
            
            // Update settings
            const settings = ev.payload.settings || {};
            settings.volume = volume;
            await ev.action.setSettings(settings);
            
            // Update display
            await this.updateDisplay(ev.action, volume);
        } catch (error) {
            console.error("Error in onWillAppear:", error);
            await ev.action.setTitle("Error");
        }
    }
    
    /**
     * Handle key down events to reset volume to 50%.
     */
    override async onKeyDown(ev: KeyDownEvent<SpotifyVolumeSettings>): Promise<void> {
        try {
            // Check if Spotify is running
            const isRunning = await this.isSpotifyRunning();
            if (!isRunning) {
                await ev.action.setTitle("Spotify\nNot Running");
                return;
            }

            // Reset volume to 50%
            const defaultVolume = 50;
            await this.setSpotifyVolume(defaultVolume);
            
            // Update settings
            const settings = ev.payload.settings || {};
            settings.volume = defaultVolume;
            await ev.action.setSettings(settings);
            
            // Update display
            await this.updateDisplay(ev.action, defaultVolume);
        } catch (error) {
            console.error("Error in onKeyDown:", error);
            await ev.action.setTitle("Error");
        }
    }

    /**
     * Handle dial rotation events to adjust Spotify volume.
     * Implements throttling and smooth transitions for fast rotations.
     */
    override async onDialRotate(ev: DialRotateEvent<SpotifyVolumeSettings>): Promise<void> {
        try {
            // Check if Spotify is running
            const isRunning = await this.isSpotifyRunning();
            if (!isRunning) {
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
            console.error("Error in onDialRotate:", error);
            await ev.action.setTitle("Error");
        }
    }

    /**
     * Update the display with the current volume.
     * Uses the custom layout to show the title, volume percentage, and volume bar.
     */
    private async updateDisplay(action: any, volume: number): Promise<void> {
        // Update the volume text in the custom layout
        // Format to match system volume display
        const volumeText = `${volume}%`;
        
        try {
            // Set feedback to update the volume text and bar in the custom layout
            await action.setFeedback({
                volume: volumeText,
                volumeBar: volume // The bar value should be the numeric volume (0-100)
            });
            
            // Also set the title for compatibility with other Stream Deck devices
            await action.setTitle(`Spotify Volume\n${volumeText}`);
            
            // Clear any image that might be set
            await action.setImage(null);
        } catch (error) {
            console.error("Error updating display:", error);
        }
        
        // Log for debugging
        console.log(`Setting volume display: Spotify Volume, ${volumeText}, Bar: ${volume}`);
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
            console.error("Error getting Spotify volume:", error);
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
            console.error("Error setting Spotify volume:", error);
            throw error;
        }
    }
}

/**
 * Settings for {@link SpotifyVolume}.
 */
type SpotifyVolumeSettings = {
    volume?: number;
};
