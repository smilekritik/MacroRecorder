/**
 * Recursive descent arithmetic expression evaluator supporting variables and floating numbers.
 */

export class NumericExpression {
  public static tryEvaluate(
    expression: string,
    variables?: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  ): { success: true; value: number } | { success: false; value: 0 } {
    try {
      const parser = new ExpressionParser(expression, variables);
      const value = parser.parse();
      if (Number.isFinite(value)) {
        return { success: true, value };
      }
      return { success: false, value: 0 };
    } catch {
      return { success: false, value: 0 };
    }
  }

  public static evaluate(
    expression: string,
    variables?: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  ): number {
    const res = NumericExpression.tryEvaluate(expression, variables);
    if (!res.success) {
      throw new Error(`Invalid numeric expression: ${expression}`);
    }
    return res.value;
  }
}

class ExpressionParser {
  private _position = 0;
  private readonly _text: string;
  private readonly _variables: ReadonlyMap<string, number>;

  public constructor(
    text: string,
    variables?: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  ) {
    this._text = text;
    if (variables instanceof Map) {
      const lower = new Map<string, number>();
      for (const [k, v] of variables.entries()) {
        lower.set(k.toLowerCase(), v);
      }
      this._variables = lower;
    } else if (variables) {
      const lower = new Map<string, number>();
      for (const [k, v] of Object.entries(variables)) {
        lower.set(k.toLowerCase(), v);
      }
      this._variables = lower;
    } else {
      this._variables = new Map<string, number>();
    }
  }

  public parse(): number {
    const value = this.expression();
    this.skip();
    if (this._position !== this._text.length) {
      throw new Error('Unexpected trailing characters');
    }
    return value;
  }

  private expression(): number {
    let value = this.term();
    while (true) {
      this.skip();
      if (this.take('+')) {
        value += this.term();
      } else if (this.take('-')) {
        value -= this.term();
      } else {
        return value;
      }
    }
  }

  private term(): number {
    let value = this.factor();
    while (true) {
      this.skip();
      if (this.take('*')) {
        value *= this.factor();
      } else if (this.take('/')) {
        value /= this.factor();
      } else {
        return value;
      }
    }
  }

  private factor(): number {
    this.skip();
    if (this.take('+')) {
      return this.factor();
    }
    if (this.take('-')) {
      return -this.factor();
    }
    if (this.take('(')) {
      const value = this.expression();
      if (!this.take(')')) {
        throw new Error('Missing closing parenthesis');
      }
      return value;
    }

    const start = this._position;
    while (
      this._position < this._text.length &&
      (/[a-zA-Z0-9]/.test(this._text[this._position]!) ||
        this._text[this._position] === '_' ||
        this._text[this._position] === '.' ||
        this._text[this._position] === ',')
    ) {
      this._position++;
    }

    if (start === this._position) {
      throw new Error('Expected number or identifier');
    }

    const token = this._text.slice(start, this._position);
    const parsedNumber = parseFloat(token.replace(',', '.'));
    if (!Number.isNaN(parsedNumber) && /^-?\d+(?:[.,]\d+)?$/.test(token)) {
      return parsedNumber;
    }

    const varName = token.replace(/%/g, '').toLowerCase();
    const varValue = this._variables.get(varName);
    if (varValue !== undefined) {
      return varValue;
    }

    if (!Number.isNaN(parsedNumber)) {
      return parsedNumber;
    }

    throw new Error(`Unknown variable: ${token}`);
  }

  private skip(): void {
    while (this._position < this._text.length && /\s/.test(this._text[this._position]!)) {
      this._position++;
    }
  }

  private take(c: string): boolean {
    this.skip();
    if (this._position >= this._text.length || this._text[this._position] !== c) {
      return false;
    }
    this._position++;
    return true;
  }
}
