import 'react-native';

import {
  render,
} from '@testing-library/react-native';

import * as React from 'react';

import {
  App,
} from '../src/App';

describe('App', () => {
  it(
    'renders the IPTV login screen',
    () => {
      const screen =
        render(<App />);

      expect(
        screen.getByTestId(
          'server-input',
        ),
      ).toBeTruthy();

      expect(
        screen.getByTestId(
          'username-input',
        ),
      ).toBeTruthy();

      expect(
        screen.getByTestId(
          'password-input',
        ),
      ).toBeTruthy();

      expect(
        screen.getByTestId(
          'connect-button',
        ),
      ).toBeTruthy();
    },
  );
});