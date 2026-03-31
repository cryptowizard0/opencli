/**
 * opencli doctor — diagnose and fix browser connectivity.
 *
 * Simplified for the daemon-based architecture. No more token management,
 * MCP path discovery, or config file scanning.
 */

import chalk from 'chalk';
import { checkDaemonStatus } from './browser/discover.js';
import { BrowserBridge } from './browser/index.js';
import { browserSession } from './runtime.js';

export type DoctorOptions = {
  fix?: boolean;
  yes?: boolean;
  live?: boolean;
  cliVersion?: string;
};

export type ConnectivityResult = {
  ok: boolean;
  error?: string;
  durationMs: number;
};

export type DoctorReport = {
  cliVersion?: string;
  daemonRunning: boolean;
  extensionConnected: boolean;
  connectivity?: ConnectivityResult;
  issues: string[];
};

/**
 * Test connectivity by attempting a real browser command.
 */
export async function checkConnectivity(opts?: { timeout?: number }): Promise<ConnectivityResult> {
  const start = Date.now();
  try {
    const mcp = new BrowserBridge();
    const page = await mcp.connect({ timeout: opts?.timeout ?? 8 });
    // Try a simple eval to verify end-to-end connectivity
    await page.evaluate('1 + 1');
    await mcp.close();
    return { ok: true, durationMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err), durationMs: Date.now() - start };
  }
}

export async function runBrowserDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  let status = await checkDaemonStatus();

  let connectivity: ConnectivityResult | undefined;
  if (opts.live) {
    connectivity = await checkConnectivity();
    // Live connectivity can auto-start the daemon, so refresh the status
    // snapshot before rendering the final report.
    status = await checkDaemonStatus();
  }

  const issues: string[] = [];
  if (!status.running) {
    issues.push('Daemon is not running. It should start automatically when you run an opencli browser command.');
  }
  if (status.running && !status.extensionConnected) {
    issues.push(
      'Daemon is running but the Chrome extension is not connected.\n' +
      'Please install the opencli Browser Bridge extension:\n' +
      '  1. Download from GitHub Releases\n' +
      '  2. Open chrome://extensions/ → Enable Developer Mode\n' +
      '  3. Click "Load unpacked" → select the extension folder',
    );
  }
  if (connectivity && !connectivity.ok) {
    issues.push(`Browser connectivity test failed: ${connectivity.error ?? 'unknown'}`);
  }

  return {
    cliVersion: opts.cliVersion,
    daemonRunning: status.running,
    extensionConnected: status.extensionConnected,
    connectivity,
    issues,
  };
}

export function renderBrowserDoctorReport(report: DoctorReport): string {
  const lines = [chalk.bold(`opencli v${report.cliVersion ?? 'unknown'} doctor`), ''];

  // Daemon status
  const daemonIcon = report.daemonRunning ? chalk.green('[OK]') : chalk.red('[MISSING]');
  lines.push(`${daemonIcon} Daemon: ${report.daemonRunning ? 'running on port 19825' : 'not running'}`);

  // Extension status
  const extIcon = report.extensionConnected ? chalk.green('[OK]') : chalk.yellow('[MISSING]');
  lines.push(`${extIcon} Extension: ${report.extensionConnected ? 'connected' : 'not connected'}`);

  // Connectivity
  if (report.connectivity) {
    const connIcon = report.connectivity.ok ? chalk.green('[OK]') : chalk.red('[FAIL]');
    const detail = report.connectivity.ok
      ? `connected in ${(report.connectivity.durationMs / 1000).toFixed(1)}s`
      : `failed (${report.connectivity.error ?? 'unknown'})`;
    lines.push(`${connIcon} Connectivity: ${detail}`);
  } else {
    lines.push(`${chalk.dim('[SKIP]')} Connectivity: not tested (use --live)`);
  }

  if (report.issues.length) {
    lines.push('', chalk.yellow('Issues:'));
    for (const issue of report.issues) {
      lines.push(chalk.dim(`  • ${issue}`));
    }
  } else if (report.daemonRunning && report.extensionConnected) {
    lines.push('', chalk.green('Everything looks good!'));
  }

  return lines.join('\n');
}
