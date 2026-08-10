import { createFixedClock } from '@/utils/clock';

import { createUsageAnalytics, SESSION_GAP_MS } from '../usageAnalytics';
import type { AnalyticsSink, InteractionEvent } from '../types';

const collector = (): AnalyticsSink & { events: InteractionEvent[] } => {
  const events: InteractionEvent[] = [];
  return { name: 'test', send: (event) => events.push(event), events };
};

const setup = () => {
  const sink = collector();
  const clock = createFixedClock(1_000_000);
  const analytics = createUsageAnalytics({
    sinks: [sink],
    clock,
    isCollectionAllowed: () => true,
  });
  return { sink, clock, analytics };
};

const names = (sink: { events: InteractionEvent[] }) => sink.events.map((event) => event.name);

describe('sessions', () => {
  it('starts one session on launch', () => {
    const { sink, analytics } = setup();
    analytics.startSession('launch');

    expect(names(sink)).toEqual(['session.started', 'app.opened']);
  });

  it('resumes rather than restarting after a short interruption', () => {
    const { sink, clock, analytics } = setup();
    analytics.startSession('launch');
    const first = analytics.currentSessionId();

    analytics.endSession('background');
    clock.advance(SESSION_GAP_MS - 1);
    analytics.startSession('foreground');

    expect(analytics.currentSessionId()).toBe(first);
    expect(names(sink).filter((name) => name === 'session.started')).toHaveLength(1);
  });

  it('starts a new session after a long absence', () => {
    const { sink, clock, analytics } = setup();
    analytics.startSession('launch');
    const first = analytics.currentSessionId();

    analytics.endSession('background');
    clock.advance(SESSION_GAP_MS + 1);
    analytics.startSession('foreground');

    expect(analytics.currentSessionId()).not.toBe(first);
    expect(names(sink).filter((name) => name === 'session.started')).toHaveLength(2);
  });
});

describe('screen tracking', () => {
  it('measures how long each screen was open', () => {
    const { sink, clock, analytics } = setup();
    analytics.startSession('launch');

    analytics.screenViewed('Home', 'home');
    clock.advance(5_000);
    analytics.screenViewed('Accounts', 'accounts');

    const exit = sink.events.find((event) => event.name === 'screen.exited');
    expect(exit?.properties).toEqual({ screen: 'Home', durationMs: 5_000 });

    const view = sink.events.filter((event) => event.name === 'screen.viewed').at(-1);
    expect(view?.properties).toEqual({ screen: 'Accounts', previousScreen: 'Home' });
  });

  it('ignores a repeat view of the screen already open', () => {
    const { sink, analytics } = setup();
    analytics.startSession('launch');

    analytics.screenViewed('Home', 'home');
    analytics.screenViewed('Home', 'home');

    expect(names(sink).filter((name) => name === 'screen.viewed')).toHaveLength(1);
  });
});

describe('privacy', () => {
  it('emits nothing when the user has opted out', () => {
    const sink = collector();
    const analytics = createUsageAnalytics({ sinks: [sink], isCollectionAllowed: () => false });

    analytics.startSession('launch');
    analytics.screenViewed('Home', 'home');
    analytics.track('card.opened', 'home', { target: 'cash' });

    expect(sink.events).toHaveLength(0);
  });

  it('carries no financial fields in its payload type', () => {
    const { sink, analytics } = setup();
    analytics.startSession('launch');
    analytics.track('card.opened', 'home', { target: 'safe-to-spend' });

    const event = sink.events.at(-1);
    // The event type has no amount/balance/merchant member at all, so this
    // asserts the shape that reaches a vendor rather than a filter that could
    // be bypassed.
    expect(Object.keys(event?.properties ?? {})).toEqual(['target']);
  });
});
