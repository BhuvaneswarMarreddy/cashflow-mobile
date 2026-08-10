import { REDACTED, redact, redactString, redactUrl } from '../redact';

/**
 * These are the tests that make production logging safe to enable. If any of
 * them regress, the logger starts leaking financial data.
 */
describe('redaction by key', () => {
  it('removes credentials whatever they contain', () => {
    const result = redact({
      password: 'hunter2',
      accessToken: 'abc.def.ghi',
      apiKey: 'k-123',
      authorization: 'Bearer xyz',
      sessionId: 'sess-1',
    }) as Record<string, unknown>;

    expect(result.password).toBe(REDACTED);
    expect(result.accessToken).toBe(REDACTED);
    expect(result.apiKey).toBe(REDACTED);
    expect(result.authorization).toBe(REDACTED);
    expect(result.sessionId).toBe(REDACTED);
  });

  it('removes account and card identifiers', () => {
    const result = redact({
      accountNumber: '000123456789',
      cardNumber: '4111111111111111',
      routingNumber: '021000021',
      ssn: '123-45-6789',
      dob: '1985-04-12',
    }) as Record<string, unknown>;

    expect(Object.values(result).every((value) => value === REDACTED)).toBe(true);
  });

  it('keeps ordinary fields intact', () => {
    const result = redact({ status: 200, screen: 'Home', count: 3 }) as Record<string, unknown>;
    expect(result).toEqual({ status: 200, screen: 'Home', count: 3 });
  });
});

describe('redaction by shape', () => {
  it('masks a card number hiding in an innocent field', () => {
    const result = redact({ description: 'PAYMENT 4111 1111 1111 1234' }) as Record<
      string,
      unknown
    >;
    expect(result.description).toBe('PAYMENT •••• 1234');
  });

  it('masks a long account number in free text', () => {
    expect(redactString('acct 000123456789 posted')).toBe('acct •••• 6789 posted');
  });

  it('removes a JWT even when the key looks harmless', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturepart';
    expect((redact({ data: jwt }) as Record<string, unknown>).data).toBe(REDACTED);
  });

  it('partially masks an email', () => {
    expect(redactString('bhuvaneswar@example.com')).toBe('b•••@example.com');
  });

  it('leaves short numbers alone so amounts stay readable', () => {
    expect(redactString('charged 4521 cents')).toBe('charged 4521 cents');
  });
});

describe('bounds', () => {
  it('stops at a depth limit rather than dumping a whole object graph', () => {
    const deep = { a: { b: { c: { d: { e: 'too far' } } } } };
    expect(JSON.stringify(redact(deep))).toContain('depth-limit');
  });

  it('survives a circular reference', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;
    expect(JSON.stringify(redact(node))).toContain('circular');
  });

  it('truncates a very long string', () => {
    const long = 'x'.repeat(900);
    expect(String(redactString(long))).toContain('[truncated]');
  });

  it('clips a long array and says how much was dropped', () => {
    const result = redact(Array.from({ length: 80 }, (_, i) => i)) as unknown[];
    expect(result).toHaveLength(51);
    expect(result[50]).toBe('…30 more');
  });

  it('reduces an Error to name and message, never a stack', () => {
    const result = redact(new Error('boom')) as Record<string, unknown>;
    expect(result).toEqual({ name: 'Error', message: 'boom' });
  });
});

describe('redactUrl', () => {
  it('strips tokens from the query string', () => {
    expect(redactUrl('/accounts?access_token=secret&limit=20')).toBe(
      `/accounts?access_token=${REDACTED}&limit=20`,
    );
  });

  it('leaves a plain path untouched', () => {
    expect(redactUrl('/accounts/acc_1')).toBe('/accounts/acc_1');
  });
});
