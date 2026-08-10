import { renderWithProviders } from '@/test/render';

import { AmountText } from '../AmountText';

describe('AmountText', () => {
  it('shows whole dollars by default', async () => {
    const { getByText } = await renderWithProviders(<AmountText cents={230_100} />);
    expect(getByText('$2,301')).toBeTruthy();
  });

  it('marks a negative amount with a sign, not only with colour', async () => {
    // The glyph is what survives greyscale and colour blindness.
    const { getByText } = await renderWithProviders(<AmountText cents={-24_000} />);
    expect(getByText('−$240')).toBeTruthy();
  });

  it('shows an explicit plus for a positive delta', async () => {
    const { getByText } = await renderWithProviders(<AmountText cents={50_000} signed />);
    expect(getByText('+$500')).toBeTruthy();
  });

  it('reads aloud as words rather than typographic symbols', async () => {
    // A screen reader handles "minus $240" correctly; the − glyph it may skip.
    const { getByLabelText } = await renderWithProviders(<AmountText cents={-24_000} />);
    expect(getByLabelText('minus $240')).toBeTruthy();
  });

  it('renders cents when precision is requested', async () => {
    const { getByText } = await renderWithProviders(<AmountText cents={230_150} precise />);
    expect(getByText('$2,301.50')).toBeTruthy();
  });
});
