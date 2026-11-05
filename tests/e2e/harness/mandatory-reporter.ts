import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

class MandatorySuiteReporter implements Reporter {
  private totalTests = 0;
  private readonly skippedTests = new Set<string>();

  onBegin(_config: FullConfig, suite: Suite): void {
    this.totalTests = suite.allTests().length;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'skipped') this.skippedTests.add(test.titlePath().join(' > '));
  }

  onEnd(_result: FullResult): { status?: FullResult['status'] } | undefined {
    const failures: string[] = [];
    if (this.totalTests === 0) failures.push('the selected mandatory suite discovered zero tests');
    if (this.skippedTests.size > 0) {
      failures.push(
        `the selected mandatory suite skipped ${this.skippedTests.size} test(s):\n` +
          [...this.skippedTests].map((title) => `  - ${title}`).join('\n'),
      );
    }

    if (failures.length === 0) return undefined;
    console.error(`MANDATORY SUITE GATE FAILED: ${failures.join('\n')}`);
    return { status: 'failed' };
  }
}

export default MandatorySuiteReporter;
