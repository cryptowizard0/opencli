import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  checkDaemonStatusMock,
  connectMock,
  closeMock,
  evaluateMock,
} = vi.hoisted(() => ({
  checkDaemonStatusMock: vi.fn(),
  connectMock: vi.fn(),
  closeMock: vi.fn(),
  evaluateMock: vi.fn(),
}));

vi.mock('./browser/discover.js', () => ({
  checkDaemonStatus: checkDaemonStatusMock,
}));

vi.mock('./browser/index.js', () => ({
  BrowserBridge: class {
    connect = connectMock;
    close = closeMock;
  },
}));

import { renderBrowserDoctorReport, runBrowserDoctor } from './doctor.js';

describe('doctor report rendering', () => {
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  beforeEach(() => {
    checkDaemonStatusMock.mockReset();
    connectMock.mockReset();
    closeMock.mockReset();
    evaluateMock.mockReset();
  });

  it('renders OK-style report when daemon and extension connected', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: true,
      extensionConnected: true,
      issues: [],
    }));

    expect(text).toContain('[OK] Daemon: running on port 19825');
    expect(text).toContain('[OK] Extension: connected');
    expect(text).toContain('Everything looks good!');
  });

  it('renders MISSING when daemon not running', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: false,
      extensionConnected: false,
      issues: ['Daemon is not running.'],
    }));

    expect(text).toContain('[MISSING] Daemon: not running');
    expect(text).toContain('[MISSING] Extension: not connected');
    expect(text).toContain('Daemon is not running.');
  });

  it('renders extension not connected when daemon is running', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: true,
      extensionConnected: false,
      issues: ['Daemon is running but the Chrome extension is not connected.'],
    }));

    expect(text).toContain('[OK] Daemon: running on port 19825');
    expect(text).toContain('[MISSING] Extension: not connected');
  });

  it('renders connectivity OK when live test succeeds', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: true,
      extensionConnected: true,
      connectivity: { ok: true, durationMs: 1234 },
      issues: [],
    }));

    expect(text).toContain('[OK] Connectivity: connected in 1.2s');
  });

  it('renders connectivity SKIP when not tested', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: true,
      extensionConnected: true,
      issues: [],
    }));

    expect(text).toContain('[SKIP] Connectivity: not tested (use --live)');
  });

  it('refreshes daemon status after a successful live connectivity check', async () => {
    checkDaemonStatusMock
      .mockResolvedValueOnce({ running: false, extensionConnected: false })
      .mockResolvedValueOnce({ running: true, extensionConnected: true });
    evaluateMock.mockResolvedValue(2);
    connectMock.mockResolvedValue({ evaluate: evaluateMock });
    closeMock.mockResolvedValue(undefined);

    const report = await runBrowserDoctor({ live: true });

    expect(checkDaemonStatusMock).toHaveBeenCalledTimes(2);
    expect(report.daemonRunning).toBe(true);
    expect(report.extensionConnected).toBe(true);
    expect(report.connectivity?.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('refreshes daemon status even when live connectivity fails', async () => {
    checkDaemonStatusMock
      .mockResolvedValueOnce({ running: false, extensionConnected: false })
      .mockResolvedValueOnce({ running: true, extensionConnected: true });
    connectMock.mockRejectedValue(new Error('bridge unavailable'));

    const report = await runBrowserDoctor({ live: true });

    expect(checkDaemonStatusMock).toHaveBeenCalledTimes(2);
    expect(report.daemonRunning).toBe(true);
    expect(report.extensionConnected).toBe(true);
    expect(report.connectivity?.ok).toBe(false);
    expect(report.issues).toContain('Browser connectivity test failed: bridge unavailable');
    expect(report.issues).not.toContain('Daemon is not running. It should start automatically when you run an opencli browser command.');
  });
});
