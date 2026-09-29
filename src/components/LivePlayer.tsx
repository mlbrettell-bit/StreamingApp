import React, {useEffect, useRef, useState} from 'react';

import {
  ActivityIndicator,
  BackHandler,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  KeplerVideoSurfaceView,
  VideoPlayer,
} from '@amazon-devices/react-native-w3cmedia';

import {
  ShakaPlayer,
  ShakaPlayerSettings,
} from '../w3cmedia/shakaplayer/ShakaPlayer';

interface LivePlayerProps {
  streamUrl: string;
  channelName: string;
  onClose: () => void;
}

type PlayerState = 'loading' | 'playing' | 'error';

const playerSettings: ShakaPlayerSettings = {
  secure: false,
  abrEnabled: true,
  abrMaxWidth: 3840,
  abrMaxHeight: 2160,
};

export const LivePlayer = ({
  streamUrl,
  channelName,
  onClose,
}: LivePlayerProps) => {
  const videoPlayer = useRef<VideoPlayer | null>(null);

  const shakaPlayer = useRef<any>(null);

  /*
   * Prevent multiple media events from calling
   * play() repeatedly while the stream is starting.
   */
  const playRequestedRef = useRef(false);

  const [playerState, setPlayerState] = useState<PlayerState>('loading');

  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onClose();

        return true;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [onClose]);

  /*
   * Explicitly start playback once the media
   * has loaded enough to begin playing.
   */
  const startPlayback = async () => {
    if (!videoPlayer.current || playRequestedRef.current) {
      return;
    }

    playRequestedRef.current = true;

    try {
      await videoPlayer.current.play();
    } catch (error) {
      playRequestedRef.current = false;

      setPlayerState('error');

      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to start playback.',
      );
    }
  };

  /*
   * Media metadata has loaded.
   * Attempt to begin playback.
   */
  const handleLoadedMetadata = () => {
    void startPlayback();
  };

  /*
   * Media reports that playback can begin.
   * This provides another opportunity to start
   * playback in case canplay fires instead of
   * loadedmetadata first.
   */
  const handleCanPlay = () => {
    void startPlayback();
  };

  /*
   * Playback has actually started.
   */
  const handlePlaying = () => {
    setPlayerState('playing');
  };

  /*
   * Playback has temporarily stopped because
   * additional media data is required.
   */
  const handleWaiting = () => {
    setPlayerState('loading');
  };

  /*
   * W3C Media playback error.
   */
  const handleError = () => {
    const mediaError = videoPlayer.current?.error;

    playRequestedRef.current = false;

    setPlayerState('error');

    setErrorMessage(
      mediaError?.message || 'The live stream could not be played.',
    );
  };

  const addPlayerListeners = () => {
    videoPlayer.current?.addEventListener(
      'loadedmetadata',
      handleLoadedMetadata,
    );

    videoPlayer.current?.addEventListener('canplay', handleCanPlay);

    videoPlayer.current?.addEventListener('playing', handlePlaying);

    videoPlayer.current?.addEventListener('waiting', handleWaiting);

    videoPlayer.current?.addEventListener('error', handleError);
  };

  const removePlayerListeners = () => {
    videoPlayer.current?.removeEventListener(
      'loadedmetadata',
      handleLoadedMetadata,
    );

    videoPlayer.current?.removeEventListener('canplay', handleCanPlay);

    videoPlayer.current?.removeEventListener('playing', handlePlaying);

    videoPlayer.current?.removeEventListener('waiting', handleWaiting);

    videoPlayer.current?.removeEventListener('error', handleError);
  };

  const onSurfaceViewCreated = async (surfaceHandle: string) => {
    try {
      setPlayerState('loading');
      setErrorMessage('');

      playRequestedRef.current = false;

      const video = new VideoPlayer();

      videoPlayer.current = video;

      /*
       * VideoPlayer must be initialized before
       * any other player operations are performed.
       */
      await video.initialize();

      /*
       * Register events before loading the stream
       * so we don't miss loadedmetadata/canplay.
       */
      addPlayerListeners();

      /*
       * Attach the Vega video surface to the
       * W3C Media VideoPlayer.
       */
      video.setSurfaceHandle(surfaceHandle);

      /*
       * We explicitly call play() ourselves once
       * loadedmetadata or canplay fires.
       */
      video.autoplay = false;

      /*
       * Create the Shaka adaptive-streaming player.
       */
      shakaPlayer.current = new ShakaPlayer(video, playerSettings);

      const content = {
        secure: 'false',
        uri: streamUrl,
        drm_scheme: '',
        drm_license_uri: '',
      };

      /*
       * Begin loading the HLS stream.
       *
       * false = Shaka itself is not responsible
       * for automatically starting playback.
       * startPlayback() will call VideoPlayer.play().
       */
      shakaPlayer.current.load(content, false);
    } catch (error) {
      playRequestedRef.current = false;

      setPlayerState('error');

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to start the live stream.',
      );
    }
  };

  const onSurfaceViewDestroyed = async (surfaceHandle: string) => {
    try {
      playRequestedRef.current = false;

      /*
       * Disconnect the video surface first.
       */
      videoPlayer.current?.clearSurfaceHandle(surfaceHandle);

      removePlayerListeners();

      /*
       * Destroy the Shaka instance.
       */
      if (shakaPlayer.current) {
        shakaPlayer.current.unload();

        shakaPlayer.current = null;
      }

      /*
       * Release the underlying W3C media player.
       */
      if (videoPlayer.current) {
        await videoPlayer.current.deinitialize();

        videoPlayer.current = null;
      }
    } catch {
      /*
       * The player view is already being destroyed,
       * so no further action is required here.
       */
    }
  };

  return (
    <View style={styles.screen}>
      <KeplerVideoSurfaceView
        style={styles.videoSurface}
        onSurfaceViewCreated={onSurfaceViewCreated}
        onSurfaceViewDestroyed={onSurfaceViewDestroyed}
      />

      {playerState === 'loading' && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />

          <Text style={styles.loadingText}>Loading {channelName}...</Text>
        </View>
      )}

      {playerState === 'error' && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Playback Error</Text>

          <Text style={styles.errorText}>{errorMessage}</Text>

          <Text style={styles.errorHint}>
            Press Back to return to the channel list.
          </Text>
        </View>
      )}

      <View pointerEvents="none" style={styles.channelOverlay}>
        <Text style={styles.channelName}>{channelName}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },

  videoSurface: {
    flex: 1,
    backgroundColor: '#000000',
  },

  loadingOverlay: {
    position: 'absolute',

    top: 0,
    bottom: 0,
    left: 0,
    right: 0,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: 'rgba(0,0,0,0.65)',
  },

  loadingText: {
    color: '#FFFFFF',
    fontSize: 22,
    marginTop: 18,
  },

  errorOverlay: {
    position: 'absolute',

    top: 0,
    bottom: 0,
    left: 0,
    right: 0,

    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 100,

    backgroundColor: 'rgba(0,0,0,0.85)',
  },

  errorTitle: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 16,
  },

  errorText: {
    color: '#FFB2B9',
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'center',
    maxWidth: 850,
  },

  errorHint: {
    color: '#AAB4C3',
    fontSize: 18,
    marginTop: 24,
  },

  channelOverlay: {
    position: 'absolute',

    left: 38,
    top: 30,

    paddingHorizontal: 18,
    paddingVertical: 10,

    borderRadius: 8,

    backgroundColor: 'rgba(0,0,0,0.65)',
  },

  channelName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
});
