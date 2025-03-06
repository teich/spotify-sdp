import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { SpotifyVolume } from "./actions/spotify-volume";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel(LogLevel.TRACE);

// Register the Spotify volume action.
streamDeck.actions.registerAction(new SpotifyVolume());

// Finally, connect to the Stream Deck.
streamDeck.connect();
