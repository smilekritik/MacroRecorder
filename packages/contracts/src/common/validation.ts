/**
 * Zero-dependency, type-safe runtime validation combinator library.
 * Designed for strict boundary validation across IPC, persistence, and native interfaces.
 */

export interface ValidationError {
  readonly path: string;
  readonly message: string;
  readonly received?: unknown;
}

export type ValidationResult<T> =
  | { readonly success: true; readonly data: T; readonly errors?: undefined }
  | {
      readonly success: false;
      readonly errors: readonly ValidationError[];
      readonly data?: undefined;
    };

export interface Schema<T> {
  readonly _output: T;
  parse(input: unknown, path?: string): ValidationResult<T>;
  is(input: unknown): input is T;
}

export function createSchema<T>(
  parser: (input: unknown, path: string) => ValidationResult<T>,
): Schema<T> {
  return {
    _output: undefined as unknown as T,
    parse(input: unknown, path = ''): ValidationResult<T> {
      return parser(input, path);
    },
    is(input: unknown): input is T {
      return parser(input, '').success;
    },
  };
}

export const string = (options?: {
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: RegExp;
}): Schema<string> => {
  return createSchema((input, path) => {
    if (typeof input !== 'string') {
      return {
        success: false,
        errors: [{ path, message: `Expected string, received ${typeof input}`, received: input }],
      };
    }
    if (options?.min !== undefined && input.length < options.min) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `String length ${input.length} is less than minimum ${options.min}`,
            received: input,
          },
        ],
      };
    }
    if (options?.max !== undefined && input.length > options.max) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `String length ${input.length} exceeds maximum ${options.max}`,
            received: input,
          },
        ],
      };
    }
    if (options?.pattern !== undefined && !options.pattern.test(input)) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `String does not match required pattern ${options.pattern}`,
            received: input,
          },
        ],
      };
    }
    return { success: true, data: input };
  });
};

export const number = (options?: {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}): Schema<number> => {
  return createSchema((input, path) => {
    if (typeof input !== 'number' || Number.isNaN(input) || !Number.isFinite(input)) {
      return {
        success: false,
        errors: [{ path, message: `Expected finite number, received ${input}`, received: input }],
      };
    }
    if (options?.integer && !Number.isSafeInteger(input)) {
      return {
        success: false,
        errors: [{ path, message: `Expected integer, received ${input}`, received: input }],
      };
    }
    if (options?.min !== undefined && input < options.min) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `Value ${input} is less than minimum ${options.min}`,
            received: input,
          },
        ],
      };
    }
    if (options?.max !== undefined && input > options.max) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `Value ${input} is greater than maximum ${options.max}`,
            received: input,
          },
        ],
      };
    }
    return { success: true, data: input };
  });
};

export const integer = (options?: {
  readonly min?: number;
  readonly max?: number;
}): Schema<number> => number({ ...options, integer: true });

export const boolean = (): Schema<boolean> => {
  return createSchema((input, path) => {
    if (typeof input !== 'boolean') {
      return {
        success: false,
        errors: [{ path, message: `Expected boolean, received ${typeof input}`, received: input }],
      };
    }
    return { success: true, data: input };
  });
};

export const literal = <const L extends string | number | boolean | null | undefined>(
  expected: L,
): Schema<L> => {
  return createSchema((input, path) => {
    if (input !== expected) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `Expected literal ${String(expected)}, received ${String(input)}`,
            received: input,
          },
        ],
      };
    }
    return { success: true, data: expected };
  });
};

export const enumValues = <const E extends string>(values: readonly E[]): Schema<E> => {
  const set = new Set<unknown>(values);
  return createSchema((input, path) => {
    if (!set.has(input)) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `Expected one of [${values.join(', ')}], received ${String(input)}`,
            received: input,
          },
        ],
      };
    }
    return { success: true, data: input as E };
  });
};

export const optional = <T>(inner: Schema<T>): Schema<T | undefined> => {
  return createSchema((input, path): ValidationResult<T | undefined> => {
    if (input === undefined) {
      return { success: true, data: undefined };
    }
    return inner.parse(input, path);
  });
};

export const nullable = <T>(inner: Schema<T>): Schema<T | null> => {
  return createSchema((input, path): ValidationResult<T | null> => {
    if (input === null) {
      return { success: true, data: null };
    }
    return inner.parse(input, path);
  });
};

export const array = <T>(
  itemSchema: Schema<T>,
  options?: { readonly min?: number; readonly max?: number },
): Schema<readonly T[]> => {
  return createSchema((input, path) => {
    if (!Array.isArray(input)) {
      return {
        success: false,
        errors: [{ path, message: `Expected array, received ${typeof input}`, received: input }],
      };
    }
    if (options?.min !== undefined && input.length < options.min) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `Array length ${input.length} is less than minimum ${options.min}`,
            received: input,
          },
        ],
      };
    }
    if (options?.max !== undefined && input.length > options.max) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `Array length ${input.length} exceeds maximum ${options.max}`,
            received: input,
          },
        ],
      };
    }
    const errors: ValidationError[] = [];
    const result: T[] = [];
    for (let i = 0; i < input.length; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      const parsed = itemSchema.parse(input[i], itemPath);
      if (parsed.success) {
        result.push(parsed.data);
      } else {
        errors.push(...parsed.errors);
      }
    }
    if (errors.length > 0) {
      return { success: false, errors };
    }
    return { success: true, data: result };
  });
};

export type ObjectShape<T> = {
  readonly [K in keyof T]: Schema<T[K]>;
};

export interface ObjectSchemaOptions {
  readonly passthrough?: boolean;
}

export type ObjectOutput<
  T extends Record<string, unknown>,
  Passthrough extends boolean,
> = Passthrough extends true
  ? { readonly [K in keyof T]: T[K] } & Readonly<Record<string, unknown>>
  : { readonly [K in keyof T]: T[K] };

export const object = <
  T extends Record<string, unknown>,
  const Opts extends ObjectSchemaOptions = Record<string, never>,
>(
  shape: ObjectShape<T>,
  options?: Opts,
): Schema<ObjectOutput<T, Opts['passthrough'] extends true ? true : false>> => {
  type Output = ObjectOutput<T, Opts['passthrough'] extends true ? true : false>;
  const shapeKeys = Object.keys(shape) as (keyof T & string)[];
  const passthrough = options?.passthrough === true;

  return createSchema((input, path) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return {
        success: false,
        errors: [
          { path, message: `Expected non-null object, received ${typeof input}`, received: input },
        ],
      };
    }
    const inputObj = input as Record<string, unknown>;
    const errors: ValidationError[] = [];
    const output: Record<string, unknown> = passthrough ? { ...inputObj } : {};

    for (const key of shapeKeys) {
      const fieldPath = path ? `${path}.${key}` : key;
      const fieldSchema = shape[key] as Schema<unknown>;
      const fieldResult = fieldSchema.parse(inputObj[key], fieldPath);
      if (fieldResult.success) {
        if (fieldResult.data !== undefined) {
          output[key] = fieldResult.data;
        } else if (key in inputObj) {
          output[key] = undefined;
        }
      } else {
        errors.push(...fieldResult.errors);
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }
    return { success: true, data: output as Output };
  });
};

export const record = <V>(valueSchema: Schema<V>): Schema<Readonly<Record<string, V>>> => {
  return createSchema((input, path) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `Expected non-null object record, received ${typeof input}`,
            received: input,
          },
        ],
      };
    }
    const inputObj = input as Record<string, unknown>;
    const errors: ValidationError[] = [];
    const output: Record<string, V> = {};

    for (const key of Object.keys(inputObj)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const parsed = valueSchema.parse(inputObj[key], fieldPath);
      if (parsed.success) {
        output[key] = parsed.data;
      } else {
        errors.push(...parsed.errors);
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }
    return { success: true, data: output };
  });
};

export const union = <T extends readonly unknown[]>(
  ...schemas: { [K in keyof T]: Schema<T[K]> }
): Schema<T[number]> => {
  return createSchema((input, path) => {
    const allErrors: ValidationError[] = [];
    for (const s of schemas) {
      const result = s.parse(input, path);
      if (result.success) {
        return result as ValidationResult<T[number]>;
      }
      allErrors.push(...result.errors);
    }
    return {
      success: false,
      errors: [
        {
          path,
          message: `Input did not match any of the ${schemas.length} union branches`,
          received: input,
        },
      ],
    };
  });
};

export const discriminatedUnion = <Tag extends string, Variants extends readonly Schema<unknown>[]>(
  tag: Tag,
  variants: Variants,
): Schema<Variants[number]['_output']> => {
  return createSchema((input, path) => {
    if (typeof input !== 'object' || input === null) {
      return {
        success: false,
        errors: [
          {
            path,
            message: `Expected object for discriminated union, received ${typeof input}`,
            received: input,
          },
        ],
      };
    }
    const tagValue = (input as Record<string, unknown>)[tag];
    for (const variant of variants) {
      const result = variant.parse(input, path);
      if (result.success) {
        return result;
      }
    }
    return {
      success: false,
      errors: [
        {
          path: path ? `${path}.${tag}` : tag,
          message: `No matching variant for discriminator ${tag} = ${String(tagValue)}`,
          received: tagValue,
        },
      ],
    };
  });
};

export const lazy = <T>(getter: () => Schema<T>): Schema<T> => {
  let cached: Schema<T> | undefined;
  return createSchema((input, path) => {
    if (!cached) {
      cached = getter();
    }
    return cached.parse(input, path);
  });
};

export function formatValidationErrors(errors: readonly ValidationError[]): string {
  return errors
    .map((e) => `${e.path || '<root>'}: ${e.message} (received: ${JSON.stringify(e.received)})`)
    .join('; ');
}
