import React, {useRef, useState} from 'react';

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';

import {
  authenticateXtream,
  getLiveCategories,
  getLiveStreams,
  XtreamCategory,
  XtreamCredentials,
  XtreamLiveStream,
} from './services/xtreamApi';

import {buildLiveStreamUrl} from './services/xtreamApi';

import {LivePlayer} from './components/LivePlayer';

type AppScreen = 'login' | 'categories' | 'channels' | 'player';

type AuthState =
  | {
      type: 'idle';
      message: '';
    }
  | {
      type: 'loading';
      message: string;
    }
  | {
      type: 'error';
      message: string;
    };

export const App = () => {
  const usernameRef = useRef<TextInput>(null);

  const passwordRef = useRef<TextInput>(null);

  const [screen, setScreen] = useState<AppScreen>('login');

  const [serverAddress, setServerAddress] = useState('');

  const [username, setUsername] = useState('');

  const [password, setPassword] = useState('');

  const [sessionCredentials, setSessionCredentials] =
    useState<XtreamCredentials | null>(null);

  const [categories, setCategories] = useState<XtreamCategory[]>([]);

  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [connectFocused, setConnectFocused] = useState(false);

  const [backFocused, setBackFocused] = useState(false);

  const [focusedCategoryId, setFocusedCategoryId] = useState<string | null>(
    null,
  );

  const [selectedCategory, setSelectedCategory] =
    useState<XtreamCategory | null>(null);

  const [channels, setChannels] = useState<XtreamLiveStream[]>([]);

  const [channelsLoading, setChannelsLoading] = useState(false);

  const [channelError, setChannelError] = useState('');

  const [focusedChannelId, setFocusedChannelId] = useState<string | null>(null);

  const [selectedChannel, setSelectedChannel] =
    useState<XtreamLiveStream | null>(null);

  const [authState, setAuthState] = useState<AuthState>({
    type: 'idle',
    message: '',
  });

  const handleConnect = async () => {
    if (authState.type === 'loading') {
      return;
    }

    if (!serverAddress.trim() || !username.trim() || !password) {
      setAuthState({
        type: 'error',
        message: 'Enter the server address, username, and password.',
      });

      return;
    }

    const credentials: XtreamCredentials = {
      serverAddress: serverAddress.trim(),

      username: username.trim(),

      password,
    };

    setAuthState({
      type: 'loading',
      message: 'Authenticating with IPTV service...',
    });

    try {
      await authenticateXtream(credentials);

      setAuthState({
        type: 'loading',
        message: 'Connected. Loading Live TV categories...',
      });

      const liveCategories = await getLiveCategories(credentials);

      setSessionCredentials(credentials);

      setCategories(liveCategories);

      setSelectedCategory(null);

      setFocusedCategoryId(null);

      setAuthState({
        type: 'idle',
        message: '',
      });

      setScreen('categories');
    } catch (error) {
      setAuthState({
        type: 'error',

        message:
          error instanceof Error
            ? error.message
            : 'Unable to connect to the IPTV service.',
      });
    }
  };

  const handleCategoryPress = async (category: XtreamCategory) => {
    if (!sessionCredentials) {
      return;
    }
    setSelectedCategory(category);
    setChannels([]);
    setSelectedChannel(null);
    setFocusedChannelId(null);
    setChannelError('');
    setChannelsLoading(true);
    setScreen('channels');

    try {
      const liveStreams = await getLiveStreams(
        sessionCredentials,
        category.category_id,
      );

      setChannels(liveStreams);
    } catch (error) {
      setChannelError(
        error instanceof Error ? error.message : 'Unable to load channels.',
      );
    } finally {
      setChannelsLoading(false);
    }
  };

  const handleChannelPress = (channel: XtreamLiveStream) => {
    setSelectedChannel(channel);

    setScreen('player');
  };

  const handleBackToCategories = () => {
    setScreen('categories');
    setSelectedChannel(null);
    setFocusedChannelId(null);
    setChannelError('');
  };

  const handleBackToLogin = () => {
    setScreen('login');

    setSelectedCategory(null);

    setFocusedCategoryId(null);
  };

  const inputStyle = (field: string) => [
    styles.input,

    focusedField === field && styles.inputFocused,
  ];

  /*
   * ------------------------------------------------
   * LIVE PLAYER SCREEN
   * ------------------------------------------------
   */

  if (screen === 'player' && sessionCredentials && selectedChannel) {
    const streamUrl = buildLiveStreamUrl(
      sessionCredentials,
      selectedChannel.stream_id,
    );

    return (
      <LivePlayer
        streamUrl={streamUrl}
        channelName={selectedChannel.name}
        onClose={() => {
          setScreen('channels');
        }}
      />
    );
  }
  /*
   * ------------------------------------------------
   * LIVE TV CHANNEL SCREEN
   * ------------------------------------------------
   */

  if (screen === 'channels' && sessionCredentials && selectedCategory) {
    return (
      <View style={styles.channelScreen}>
        <View style={styles.categoryHeader}>
          <View>
            <Text style={styles.eyebrow}>LIVE TV</Text>

            <Text style={styles.channelScreenTitle}>
              {selectedCategory.category_name}
            </Text>

            {!channelsLoading && !channelError && (
              <Text style={styles.categorySubtitle}>
                {channels.length}{' '}
                {channels.length === 1 ? 'channel' : 'channels'}
              </Text>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Live TV categories"
            onPress={handleBackToCategories}
            onFocus={() => setBackFocused(true)}
            onBlur={() => setBackFocused(false)}
            style={[
              styles.backButton,

              backFocused && styles.backButtonFocused,
            ]}>
            <Text style={styles.backButtonText}>Categories</Text>
          </Pressable>
        </View>

        {channelsLoading ? (
          <View style={styles.channelLoadingContainer}>
            <ActivityIndicator size="large" color="#5DD6C0" />

            <Text style={styles.channelLoadingText}>Loading channels...</Text>
          </View>
        ) : channelError ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Unable to load channels</Text>

            <Text style={styles.emptyText}>{channelError}</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => handleCategoryPress(selectedCategory)}
              onFocus={() => setConnectFocused(true)}
              onBlur={() => setConnectFocused(false)}
              style={[
                styles.retryButton,

                connectFocused && styles.retryButtonFocused,
              ]}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : channels.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No channels found</Text>

            <Text style={styles.emptyText}>
              The provider returned no live channels for this category.
            </Text>
          </View>
        ) : (
          <TVFocusGuideView style={styles.channelListContainer} autoFocus>
            <FlatList
              data={channels}
              keyExtractor={(item) => item.stream_id}
              initialNumToRender={20}
              contentContainerStyle={styles.channelList}
              renderItem={({item}) => {
                const isFocused = focusedChannelId === item.stream_id;

                const isSelected =
                  selectedChannel?.stream_id === item.stream_id;

                return (
                  <Pressable
                    testID={`channel-${item.stream_id}`}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    onFocus={() => setFocusedChannelId(item.stream_id)}
                    onBlur={() =>
                      setFocusedChannelId((current) =>
                        current === item.stream_id ? null : current,
                      )
                    }
                    onPress={() => handleChannelPress(item)}
                    style={[
                      styles.channelRow,

                      isSelected && styles.channelRowSelected,

                      isFocused && styles.channelRowFocused,
                    ]}>
                    <View style={styles.channelNumberContainer}>
                      <Text style={styles.channelNumber}>
                        {item.num ?? '—'}
                      </Text>
                    </View>

                    <View style={styles.channelInfo}>
                      <Text numberOfLines={1} style={styles.channelName}>
                        {item.name}
                      </Text>

                      {item.epg_channel_id ? (
                        <Text numberOfLines={1} style={styles.channelMeta}>
                          EPG: {item.epg_channel_id}
                        </Text>
                      ) : (
                        <Text style={styles.channelMeta}>
                          Stream ID: {item.stream_id}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.channelArrow}>›</Text>
                  </Pressable>
                );
              }}
            />
          </TVFocusGuideView>
        )}

        {selectedChannel && (
          <View style={styles.selectionPanel}>
            <View>
              <Text style={styles.selectionLabel}>SELECTED CHANNEL</Text>

              <Text style={styles.selectionTitle}>{selectedChannel.name}</Text>
            </View>

            <Text style={styles.selectionHint}>
              Channel selection is working. Playback comes next.
            </Text>
          </View>
        )}
      </View>
    );
  }

  /*
   * ------------------------------------------------
   * LIVE TV CATEGORY SCREEN
   * ------------------------------------------------
   */

  if (screen === 'categories' && sessionCredentials) {
    return (
      <View style={styles.categoryScreen}>
        <View style={styles.categoryHeader}>
          <View>
            <Text style={styles.eyebrow}>LIVE TV</Text>

            <Text style={styles.categoryTitle}>Categories</Text>

            <Text style={styles.categorySubtitle}>
              {categories.length}{' '}
              {categories.length === 1 ? 'category' : 'categories'} loaded
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to IPTV login"
            onPress={handleBackToLogin}
            onFocus={() => setBackFocused(true)}
            onBlur={() => setBackFocused(false)}
            style={[
              styles.backButton,

              backFocused && styles.backButtonFocused,
            ]}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>

        {categories.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Live TV categories</Text>

            <Text style={styles.emptyText}>
              The IPTV account authenticated, but the provider returned no Live
              TV categories.
            </Text>
          </View>
        ) : (
          <TVFocusGuideView style={styles.categoryListContainer} autoFocus>
            <FlatList
              data={categories}
              keyExtractor={(item) => item.category_id}
              numColumns={4}
              initialNumToRender={16}
              contentContainerStyle={styles.categoryList}
              renderItem={({item}) => {
                const isFocused = focusedCategoryId === item.category_id;

                const isSelected =
                  selectedCategory?.category_id === item.category_id;

                return (
                  <Pressable
                    testID={`category-${item.category_id}`}
                    accessibilityRole="button"
                    accessibilityLabel={item.category_name}
                    onFocus={() => setFocusedCategoryId(item.category_id)}
                    onBlur={() =>
                      setFocusedCategoryId((current) =>
                        current === item.category_id ? null : current,
                      )
                    }
                    onPress={() => handleCategoryPress(item)}
                    style={[
                      styles.categoryCard,

                      isSelected && styles.categoryCardSelected,

                      isFocused && styles.categoryCardFocused,
                    ]}>
                    <Text numberOfLines={2} style={styles.categoryCardTitle}>
                      {item.category_name}
                    </Text>

                    <Text style={styles.categoryCardId}>
                      ID {item.category_id}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </TVFocusGuideView>
        )}
      </View>
    );
  }

  /*
   * ------------------------------------------------
   * LOGIN SCREEN
   * ------------------------------------------------
   */

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>IPTV PLAYER</Text>

        <Text style={styles.title}>Connect your service</Text>

        <Text style={styles.subtitle}>
          Enter the Xtream credentials supplied by your IPTV provider.
        </Text>

        <Text style={styles.disclaimer}>
          This application does not provide or host any media.
        </Text>
      </View>

      <TVFocusGuideView style={styles.card} autoFocus>
        <Text style={styles.label}>Server Address</Text>

        <TextInput
          testID="server-input"
          accessibilityLabel="IPTV server address"
          style={inputStyle('server')}
          value={serverAddress}
          onChangeText={setServerAddress}
          onFocus={() => setFocusedField('server')}
          onBlur={() => setFocusedField(null)}
          onSubmitEditing={() => usernameRef.current?.focus()}
          placeholder="https://server.example.com:port"
          placeholderTextColor="#77808F"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={styles.label}>Username</Text>

        <TextInput
          ref={usernameRef}
          testID="username-input"
          accessibilityLabel="IPTV username"
          style={inputStyle('username')}
          value={username}
          onChangeText={setUsername}
          onFocus={() => setFocusedField('username')}
          onBlur={() => setFocusedField(null)}
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="Username"
          placeholderTextColor="#77808F"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={styles.label}>Password</Text>

        <TextInput
          ref={passwordRef}
          testID="password-input"
          accessibilityLabel="IPTV password"
          style={inputStyle('password')}
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
          onSubmitEditing={handleConnect}
          placeholder="Password"
          placeholderTextColor="#77808F"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          returnKeyType="done"
        />

        <Text style={styles.helperText}>
          Enter the exact server address and port supplied by your IPTV
          provider.
        </Text>

        <Pressable
          testID="connect-button"
          accessibilityRole="button"
          accessibilityLabel="Connect to IPTV service"
          disabled={authState.type === 'loading'}
          onPress={handleConnect}
          onFocus={() => setConnectFocused(true)}
          onBlur={() => setConnectFocused(false)}
          style={[
            styles.connectButton,

            connectFocused && styles.connectButtonFocused,

            authState.type === 'loading' && styles.connectButtonDisabled,
          ]}>
          {authState.type === 'loading' ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator size="small" color="#071019" />

              <Text style={styles.connectButtonText}>Connecting...</Text>
            </View>
          ) : (
            <Text style={styles.connectButtonText}>Connect</Text>
          )}
        </Pressable>

        {authState.type !== 'idle' && (
          <View
            testID="auth-message"
            style={[
              styles.messageBox,

              authState.type === 'error' ? styles.errorBox : styles.loadingBox,
            ]}>
            <Text
              style={[
                styles.messageText,

                authState.type === 'error'
                  ? styles.errorText
                  : styles.loadingText,
              ]}>
              {authState.message}
            </Text>
          </View>
        )}
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  /*
   * LOGIN
   */

  screen: {
    flex: 1,
    backgroundColor: '#071019',
    paddingHorizontal: 84,
    paddingVertical: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 72,
  },

  hero: {
    flex: 1,
    maxWidth: 640,
  },

  eyebrow: {
    color: '#5DD6C0',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 4,
    marginBottom: 16,
  },

  title: {
    color: '#F7FAFC',
    fontSize: 58,
    lineHeight: 66,
    fontWeight: '700',
    marginBottom: 22,
  },

  subtitle: {
    color: '#AAB4C3',
    fontSize: 24,
    lineHeight: 34,
  },

  disclaimer: {
    color: '#697687',
    fontSize: 17,
    marginTop: 16,
  },

  card: {
    width: 590,
    backgroundColor: '#101B27',
    borderRadius: 24,
    padding: 34,
    borderWidth: 1,
    borderColor: '#243241',
  },

  label: {
    color: '#DCE4EE',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
  },

  input: {
    height: 62,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#334252',
    backgroundColor: '#0B151F',
    color: '#FFFFFF',
    fontSize: 22,
    paddingHorizontal: 18,
    marginBottom: 20,
  },

  inputFocused: {
    borderColor: '#5DD6C0',
    backgroundColor: '#122331',
  },

  helperText: {
    color: '#8793A4',
    fontSize: 16,
    lineHeight: 22,
    marginTop: -4,
    marginBottom: 24,
  },

  connectButton: {
    minHeight: 62,
    borderRadius: 12,
    backgroundColor: '#5DD6C0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },

  connectButtonFocused: {
    borderColor: '#FFFFFF',
    transform: [
      {
        scale: 1.03,
      },
    ],
  },

  connectButtonDisabled: {
    opacity: 0.65,
  },

  connectButtonText: {
    color: '#071019',
    fontSize: 22,
    fontWeight: '800',
  },

  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  messageBox: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
  },

  errorBox: {
    backgroundColor: '#32191C',
    borderColor: '#A94B55',
  },

  loadingBox: {
    backgroundColor: '#132332',
    borderColor: '#37526B',
  },

  messageText: {
    fontSize: 17,
    lineHeight: 24,
  },

  errorText: {
    color: '#FFB2B9',
  },

  loadingText: {
    color: '#B7C8D8',
  },

  /*
   * LIVE TV CHANNEL SCREEN
   */

  channelScreen: {
    flex: 1,
    backgroundColor: '#071019',
    paddingHorizontal: 64,
    paddingTop: 44,
    paddingBottom: 32,
  },

  channelScreenTitle: {
    color: '#F7FAFC',
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '700',
    maxWidth: 900,
  },

  channelListContainer: {
    flex: 1,
  },

  channelList: {
    paddingBottom: 24,
  },

  channelRow: {
    minHeight: 78,
    marginVertical: 5,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#243241',
    backgroundColor: '#101B27',

    flexDirection: 'row',
    alignItems: 'center',
  },

  channelRowFocused: {
    borderColor: '#5DD6C0',
    backgroundColor: '#152D35',

    transform: [
      {
        scale: 1.01,
      },
    ],
  },

  channelRowSelected: {
    backgroundColor: '#17362F',
  },

  channelNumberContainer: {
    width: 72,
  },

  channelNumber: {
    color: '#718093',
    fontSize: 18,
    fontWeight: '600',
  },

  channelInfo: {
    flex: 1,
  },

  channelName: {
    color: '#F7FAFC',
    fontSize: 22,
    fontWeight: '700',
  },

  channelMeta: {
    color: '#718093',
    fontSize: 14,
    marginTop: 4,
  },

  channelArrow: {
    color: '#5DD6C0',
    fontSize: 34,
    marginLeft: 20,
  },

  channelLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  channelLoadingText: {
    color: '#AAB4C3',
    fontSize: 20,
    marginTop: 18,
  },

  retryButton: {
    marginTop: 28,
    minWidth: 180,
    minHeight: 58,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: '#5DD6C0',
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  retryButtonFocused: {
    borderColor: '#FFFFFF',

    transform: [
      {
        scale: 1.05,
      },
    ],
  },

  retryButtonText: {
    color: '#071019',
    fontSize: 19,
    fontWeight: '800',
  },

  /*
   * LIVE TV CATEGORY SCREEN
   */

  categoryScreen: {
    flex: 1,
    backgroundColor: '#071019',
    paddingHorizontal: 64,
    paddingTop: 44,
    paddingBottom: 32,
  },

  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 26,
  },

  categoryTitle: {
    color: '#F7FAFC',
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '700',
  },

  categorySubtitle: {
    color: '#8793A4',
    fontSize: 19,
    marginTop: 6,
  },

  backButton: {
    minWidth: 130,
    height: 56,
    paddingHorizontal: 26,
    borderRadius: 12,
    backgroundColor: '#152230',
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backButtonFocused: {
    borderColor: '#5DD6C0',
    transform: [
      {
        scale: 1.05,
      },
    ],
  },

  backButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },

  categoryListContainer: {
    flex: 1,
  },

  categoryList: {
    paddingBottom: 24,
  },

  categoryCard: {
    flex: 1,
    height: 128,
    margin: 9,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#101B27',
    borderWidth: 3,
    borderColor: '#243241',
    justifyContent: 'space-between',
  },

  categoryCardFocused: {
    backgroundColor: '#152D35',
    borderColor: '#5DD6C0',
    transform: [
      {
        scale: 1.05,
      },
    ],
  },

  categoryCardSelected: {
    backgroundColor: '#17362F',
  },

  categoryCardTitle: {
    color: '#F4F7FA',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '700',
  },

  categoryCardId: {
    color: '#718093',
    fontSize: 14,
  },

  selectionPanel: {
    minHeight: 82,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D8A73',
    backgroundColor: '#0E2B25',
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  selectionLabel: {
    color: '#5DD6C0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },

  selectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 3,
  },

  selectionHint: {
    color: '#8EE7D2',
    fontSize: 16,
    maxWidth: 520,
    textAlign: 'right',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
  },

  emptyText: {
    color: '#8793A4',
    fontSize: 19,
    marginTop: 12,
    maxWidth: 600,
    textAlign: 'center',
    lineHeight: 27,
  },
});
