import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';

type AuthState =
  | {type: 'idle'; message: ''}
  | {type: 'loading'; message: string}
  | {type: 'success'; message: string}
  | {type: 'error'; message: string};

type XtreamUserInfo = {
  auth?: number | string;
  status?: string;
  message?: string;
};

type XtreamAuthResponse = {
  user_info?: XtreamUserInfo;
  server_info?: Record<string, unknown>;
};

const AUTH_TIMEOUT_MS = 12000;

const buildAuthUrl = (
  serverAddress: string,
  username: string,
  password: string,
) => {
  const trimmedServer = serverAddress.trim();

  if (!/^https?:\/\//i.test(trimmedServer)) {
    throw new Error(
      'Server address must begin with http:// or https://.',
    );
  }

  const baseUrl = trimmedServer
    .replace(/\/player_api\.php(?:\?.*)?$/i, '')
    .replace(/\/+$/, '');

  return (
    `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}` +
    `&password=${encodeURIComponent(password)}`
  );
};

const authenticateXtream = async (
  serverAddress: string,
  username: string,
  password: string,
): Promise<XtreamAuthResponse> => {
  const requestUrl = buildAuthUrl(serverAddress, username, password);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            'Connection timed out. Check the server address, port, and network connection.',
          ),
        );
      }, AUTH_TIMEOUT_MS);
    });

    const response = await Promise.race([
      fetch(requestUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }),
      timeout,
    ]);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          'Server reached, but the Xtream API was not found. Check the server address and port.',
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Server rejected the request (HTTP ${response.status}). Check your credentials.`,
        );
      }

      throw new Error(
        `Server returned HTTP ${response.status}.`,
      );
    }

    const rawBody = await response.text();

    let payload: XtreamAuthResponse;

    try {
      payload = JSON.parse(rawBody) as XtreamAuthResponse;
    } catch {
      throw new Error(
        'Server reached, but it did not return a valid Xtream JSON response.',
      );
    }

    if (!payload.user_info) {
      throw new Error(
        'Server reached, but no Xtream account information was returned.',
      );
    }

    const authenticated =
      payload.user_info.auth === 1 ||
      payload.user_info.auth === '1';

    if (!authenticated) {
      const providerStatus = payload.user_info.status?.trim();
      const providerMessage = payload.user_info.message?.trim();

      if (providerStatus && providerMessage) {
        throw new Error(
          `Authentication failed: ${providerStatus}. ${providerMessage}`,
        );
      }

      if (providerStatus) {
        throw new Error(
          `Authentication failed: ${providerStatus}.`,
        );
      }

      throw new Error(
        providerMessage ||
          'Authentication failed. Check the username and password.',
      );
    }

    const accountStatus = payload.user_info.status?.trim();

    if (
      accountStatus &&
      accountStatus.toLowerCase() !== 'active'
    ) {
      throw new Error(
        `Account status is ${accountStatus}.`,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      'Unable to reach the IPTV server.',
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const App = () => {
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [serverAddress, setServerAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [focusedField, setFocusedField] =
    useState<string | null>(null);

  const [connectFocused, setConnectFocused] =
    useState(false);

  const [authState, setAuthState] =
    useState<AuthState>({
      type: 'idle',
      message: '',
    });

  const handleConnect = async () => {
    if (authState.type === 'loading') {
      return;
    }

    if (
      !serverAddress.trim() ||
      !username.trim() ||
      !password
    ) {
      setAuthState({
        type: 'error',
        message:
          'Enter the server address, username, and password.',
      });

      return;
    }

    setAuthState({
      type: 'loading',
      message: 'Connecting to IPTV service...',
    });

    try {
      await authenticateXtream(
        serverAddress,
        username,
        password,
      );

      setAuthState({
        type: 'success',
        message:
          'Connection successful. IPTV account authenticated.',
      });
    } catch (error) {
      setAuthState({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to authenticate with the IPTV service.',
      });
    }
  };

  const inputStyle = (field: string) => [
    styles.input,
    focusedField === field &&
      styles.inputFocused,
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>
          IPTV PLAYER
        </Text>

        <Text style={styles.title}>
          Connect your service
        </Text>

        <Text style={styles.subtitle}>
          Enter the Xtream credentials supplied
          by your IPTV provider.
        </Text>

        <Text style={styles.disclaimer}>
          This application does not provide or
          host any media.
        </Text>
      </View>

      <TVFocusGuideView
        style={styles.card}
        autoFocus>

        <Text style={styles.label}>
          Server Address
        </Text>

        <TextInput
          testID="server-input"
          accessibilityLabel="IPTV server address"
          style={inputStyle('server')}
          value={serverAddress}
          onChangeText={setServerAddress}
          onFocus={() =>
            setFocusedField('server')
          }
          onBlur={() =>
            setFocusedField(null)
          }
          onSubmitEditing={() =>
            usernameRef.current?.focus()
          }
          placeholder="https://server.example.com:port"
          placeholderTextColor="#77808F"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={styles.label}>
          Username
        </Text>

        <TextInput
          ref={usernameRef}
          testID="username-input"
          accessibilityLabel="IPTV username"
          style={inputStyle('username')}
          value={username}
          onChangeText={setUsername}
          onFocus={() =>
            setFocusedField('username')
          }
          onBlur={() =>
            setFocusedField(null)
          }
          onSubmitEditing={() =>
            passwordRef.current?.focus()
          }
          placeholder="Username"
          placeholderTextColor="#77808F"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={styles.label}>
          Password
        </Text>

        <TextInput
          ref={passwordRef}
          testID="password-input"
          accessibilityLabel="IPTV password"
          style={inputStyle('password')}
          value={password}
          onChangeText={setPassword}
          onFocus={() =>
            setFocusedField('password')
          }
          onBlur={() =>
            setFocusedField(null)
          }
          onSubmitEditing={handleConnect}
          placeholder="Password"
          placeholderTextColor="#77808F"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          returnKeyType="done"
        />

        <Text style={styles.helperText}>
          Enter the exact server address and port
          supplied by your IPTV provider.
        </Text>

        <Pressable
          testID="connect-button"
          accessibilityRole="button"
          accessibilityLabel="Connect to IPTV service"
          disabled={authState.type === 'loading'}
          onPress={handleConnect}
          onFocus={() =>
            setConnectFocused(true)
          }
          onBlur={() =>
            setConnectFocused(false)
          }
          style={[
            styles.connectButton,
            connectFocused &&
              styles.connectButtonFocused,
            authState.type === 'loading' &&
              styles.connectButtonDisabled,
          ]}>

          {authState.type === 'loading' ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator
                size="small"
                color="#071019"
              />

              <Text
                style={styles.connectButtonText}>
                Connecting...
              </Text>
            </View>
          ) : (
            <Text
              style={styles.connectButtonText}>
              Connect
            </Text>
          )}
        </Pressable>

        {authState.type !== 'idle' && (
          <View
            testID="auth-message"
            style={[
              styles.messageBox,

              authState.type === 'success'
                ? styles.successBox
                : authState.type === 'error'
                  ? styles.errorBox
                  : styles.loadingBox,
            ]}>

            <Text
              style={[
                styles.messageText,

                authState.type === 'success'
                  ? styles.successText
                  : authState.type === 'error'
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
    transform: [{scale: 1.03}],
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

  successBox: {
    backgroundColor: '#0E2B25',
    borderColor: '#2D8A73',
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

  successText: {
    color: '#8EE7D2',
  },

  errorText: {
    color: '#FFB2B9',
  },

  loadingText: {
    color: '#B7C8D8',
  },
});