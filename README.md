# Spotify Volume Control for Stream Deck (macOS only)

A Stream Deck plugin that allows you to control Spotify volume using the dial on your Stream Deck Plus. Easily adjust volume, mute/unmute, and see visual feedback of your current volume level. This plugin is specifically designed for macOS, providing app-specific volume control for Spotify that the default volume controller plugin in the Elgato marketplace doesn't support on Mac.

## Features

- Control Spotify volume by rotating the dial on Stream Deck Plus
- Mute/unmute Spotify by pressing the dial or tapping the touchscreen
- Visual feedback showing current volume level with percentage and bar indicator
- Smooth volume transitions with throttling to prevent overwhelming Spotify with rapid changes
- Automatic detection of Spotify running state
- Optimized for Stream Deck Plus with dial controls

## Requirements

- Stream Deck Plus (with dial controls)
- **macOS 12 or later** (this plugin is macOS only)
- Spotify desktop application
- Stream Deck software v6.4 or later

## Installation

1. Download the latest release from the [releases page](https://github.com/oren-teich/spotify-sdp/releases)
2. Double-click the downloaded file to install it in the Stream Deck software
3. The Spotify Volume control will appear in your Stream Deck actions list

## Usage

### Adding to Stream Deck

1. Open the Stream Deck software
2. Drag the "Spotify Volume" action to an encoder slot on your Stream Deck Plus
3. The action will automatically display the current Spotify volume when Spotify is running

### Controlling Volume

- **Rotate the dial** to adjust Spotify volume up or down
- **Press the dial** or **tap the touchscreen** to toggle mute/unmute
- The display will show the current volume percentage and a visual indicator bar
- If Spotify is not running, the display will show "Spotify Not Running"

## Development

### Prerequisites

- Node.js 20 or later
- npm or yarn
- Stream Deck SDK

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/oren-teich/spotify-sdp.git
   cd spotify-sdp
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the plugin:
   ```
   npm run build
   ```

4. For development with auto-reload:
   ```
   npm run watch
   ```

### Project Structure

- `src/actions/spotify-volume.ts` - Main implementation of the Spotify Volume control
- `src/plugin.ts` - Plugin initialization and registration
- `com.oren-teich.spotify-sdp.sdPlugin/` - Plugin resources and manifest

### How It Works

The plugin uses AppleScript to interact with the Spotify application on macOS, providing app-specific volume control that isn't available in the default Stream Deck volume controller. It can:
- Get the current volume level
- Set the volume level
- Toggle mute/unmute
- Check if Spotify is running

## License

MIT License

## Acknowledgements

- Built with [Elgato Stream Deck SDK](https://developer.elgato.com/documentation/stream-deck/sdk/overview/)
- Uses AppleScript for Spotify integration
