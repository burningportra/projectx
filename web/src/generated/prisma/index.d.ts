
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model OhlcBar
 * 
 */
export type OhlcBar = $Result.DefaultSelection<Prisma.$OhlcBarPayload>
/**
 * Model TrendPoint
 * 
 */
export type TrendPoint = $Result.DefaultSelection<Prisma.$TrendPointPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more OhlcBars
 * const ohlcBars = await prisma.ohlcBar.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more OhlcBars
   * const ohlcBars = await prisma.ohlcBar.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.ohlcBar`: Exposes CRUD operations for the **OhlcBar** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more OhlcBars
    * const ohlcBars = await prisma.ohlcBar.findMany()
    * ```
    */
  get ohlcBar(): Prisma.OhlcBarDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.trendPoint`: Exposes CRUD operations for the **TrendPoint** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more TrendPoints
    * const trendPoints = await prisma.trendPoint.findMany()
    * ```
    */
  get trendPoint(): Prisma.TrendPointDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.7.0
   * Query Engine version: 3cff47a7f5d65c3ea74883f1d736e41d68ce91ed
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    OhlcBar: 'OhlcBar',
    TrendPoint: 'TrendPoint'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "ohlcBar" | "trendPoint"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      OhlcBar: {
        payload: Prisma.$OhlcBarPayload<ExtArgs>
        fields: Prisma.OhlcBarFieldRefs
        operations: {
          findUnique: {
            args: Prisma.OhlcBarFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.OhlcBarFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload>
          }
          findFirst: {
            args: Prisma.OhlcBarFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.OhlcBarFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload>
          }
          findMany: {
            args: Prisma.OhlcBarFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload>[]
          }
          create: {
            args: Prisma.OhlcBarCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload>
          }
          createMany: {
            args: Prisma.OhlcBarCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.OhlcBarCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload>[]
          }
          delete: {
            args: Prisma.OhlcBarDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload>
          }
          update: {
            args: Prisma.OhlcBarUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload>
          }
          deleteMany: {
            args: Prisma.OhlcBarDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.OhlcBarUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.OhlcBarUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload>[]
          }
          upsert: {
            args: Prisma.OhlcBarUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OhlcBarPayload>
          }
          aggregate: {
            args: Prisma.OhlcBarAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateOhlcBar>
          }
          groupBy: {
            args: Prisma.OhlcBarGroupByArgs<ExtArgs>
            result: $Utils.Optional<OhlcBarGroupByOutputType>[]
          }
          count: {
            args: Prisma.OhlcBarCountArgs<ExtArgs>
            result: $Utils.Optional<OhlcBarCountAggregateOutputType> | number
          }
        }
      }
      TrendPoint: {
        payload: Prisma.$TrendPointPayload<ExtArgs>
        fields: Prisma.TrendPointFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TrendPointFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TrendPointFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload>
          }
          findFirst: {
            args: Prisma.TrendPointFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TrendPointFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload>
          }
          findMany: {
            args: Prisma.TrendPointFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload>[]
          }
          create: {
            args: Prisma.TrendPointCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload>
          }
          createMany: {
            args: Prisma.TrendPointCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TrendPointCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload>[]
          }
          delete: {
            args: Prisma.TrendPointDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload>
          }
          update: {
            args: Prisma.TrendPointUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload>
          }
          deleteMany: {
            args: Prisma.TrendPointDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TrendPointUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TrendPointUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload>[]
          }
          upsert: {
            args: Prisma.TrendPointUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPointPayload>
          }
          aggregate: {
            args: Prisma.TrendPointAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTrendPoint>
          }
          groupBy: {
            args: Prisma.TrendPointGroupByArgs<ExtArgs>
            result: $Utils.Optional<TrendPointGroupByOutputType>[]
          }
          count: {
            args: Prisma.TrendPointCountArgs<ExtArgs>
            result: $Utils.Optional<TrendPointCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    ohlcBar?: OhlcBarOmit
    trendPoint?: TrendPointOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */



  /**
   * Models
   */

  /**
   * Model OhlcBar
   */

  export type AggregateOhlcBar = {
    _count: OhlcBarCountAggregateOutputType | null
    _avg: OhlcBarAvgAggregateOutputType | null
    _sum: OhlcBarSumAggregateOutputType | null
    _min: OhlcBarMinAggregateOutputType | null
    _max: OhlcBarMaxAggregateOutputType | null
  }

  export type OhlcBarAvgAggregateOutputType = {
    id: number | null
    open: number | null
    high: number | null
    low: number | null
    close: number | null
    volume: number | null
    timeframeUnit: number | null
    timeframeValue: number | null
  }

  export type OhlcBarSumAggregateOutputType = {
    id: number | null
    open: number | null
    high: number | null
    low: number | null
    close: number | null
    volume: number | null
    timeframeUnit: number | null
    timeframeValue: number | null
  }

  export type OhlcBarMinAggregateOutputType = {
    id: number | null
    contractId: string | null
    timestamp: Date | null
    open: number | null
    high: number | null
    low: number | null
    close: number | null
    volume: number | null
    timeframeUnit: number | null
    timeframeValue: number | null
  }

  export type OhlcBarMaxAggregateOutputType = {
    id: number | null
    contractId: string | null
    timestamp: Date | null
    open: number | null
    high: number | null
    low: number | null
    close: number | null
    volume: number | null
    timeframeUnit: number | null
    timeframeValue: number | null
  }

  export type OhlcBarCountAggregateOutputType = {
    id: number
    contractId: number
    timestamp: number
    open: number
    high: number
    low: number
    close: number
    volume: number
    timeframeUnit: number
    timeframeValue: number
    _all: number
  }


  export type OhlcBarAvgAggregateInputType = {
    id?: true
    open?: true
    high?: true
    low?: true
    close?: true
    volume?: true
    timeframeUnit?: true
    timeframeValue?: true
  }

  export type OhlcBarSumAggregateInputType = {
    id?: true
    open?: true
    high?: true
    low?: true
    close?: true
    volume?: true
    timeframeUnit?: true
    timeframeValue?: true
  }

  export type OhlcBarMinAggregateInputType = {
    id?: true
    contractId?: true
    timestamp?: true
    open?: true
    high?: true
    low?: true
    close?: true
    volume?: true
    timeframeUnit?: true
    timeframeValue?: true
  }

  export type OhlcBarMaxAggregateInputType = {
    id?: true
    contractId?: true
    timestamp?: true
    open?: true
    high?: true
    low?: true
    close?: true
    volume?: true
    timeframeUnit?: true
    timeframeValue?: true
  }

  export type OhlcBarCountAggregateInputType = {
    id?: true
    contractId?: true
    timestamp?: true
    open?: true
    high?: true
    low?: true
    close?: true
    volume?: true
    timeframeUnit?: true
    timeframeValue?: true
    _all?: true
  }

  export type OhlcBarAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which OhlcBar to aggregate.
     */
    where?: OhlcBarWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OhlcBars to fetch.
     */
    orderBy?: OhlcBarOrderByWithRelationInput | OhlcBarOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: OhlcBarWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OhlcBars from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OhlcBars.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned OhlcBars
    **/
    _count?: true | OhlcBarCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: OhlcBarAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: OhlcBarSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: OhlcBarMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: OhlcBarMaxAggregateInputType
  }

  export type GetOhlcBarAggregateType<T extends OhlcBarAggregateArgs> = {
        [P in keyof T & keyof AggregateOhlcBar]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateOhlcBar[P]>
      : GetScalarType<T[P], AggregateOhlcBar[P]>
  }




  export type OhlcBarGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OhlcBarWhereInput
    orderBy?: OhlcBarOrderByWithAggregationInput | OhlcBarOrderByWithAggregationInput[]
    by: OhlcBarScalarFieldEnum[] | OhlcBarScalarFieldEnum
    having?: OhlcBarScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: OhlcBarCountAggregateInputType | true
    _avg?: OhlcBarAvgAggregateInputType
    _sum?: OhlcBarSumAggregateInputType
    _min?: OhlcBarMinAggregateInputType
    _max?: OhlcBarMaxAggregateInputType
  }

  export type OhlcBarGroupByOutputType = {
    id: number
    contractId: string
    timestamp: Date
    open: number
    high: number
    low: number
    close: number
    volume: number | null
    timeframeUnit: number
    timeframeValue: number
    _count: OhlcBarCountAggregateOutputType | null
    _avg: OhlcBarAvgAggregateOutputType | null
    _sum: OhlcBarSumAggregateOutputType | null
    _min: OhlcBarMinAggregateOutputType | null
    _max: OhlcBarMaxAggregateOutputType | null
  }

  type GetOhlcBarGroupByPayload<T extends OhlcBarGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<OhlcBarGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof OhlcBarGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], OhlcBarGroupByOutputType[P]>
            : GetScalarType<T[P], OhlcBarGroupByOutputType[P]>
        }
      >
    >


  export type OhlcBarSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    contractId?: boolean
    timestamp?: boolean
    open?: boolean
    high?: boolean
    low?: boolean
    close?: boolean
    volume?: boolean
    timeframeUnit?: boolean
    timeframeValue?: boolean
  }, ExtArgs["result"]["ohlcBar"]>

  export type OhlcBarSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    contractId?: boolean
    timestamp?: boolean
    open?: boolean
    high?: boolean
    low?: boolean
    close?: boolean
    volume?: boolean
    timeframeUnit?: boolean
    timeframeValue?: boolean
  }, ExtArgs["result"]["ohlcBar"]>

  export type OhlcBarSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    contractId?: boolean
    timestamp?: boolean
    open?: boolean
    high?: boolean
    low?: boolean
    close?: boolean
    volume?: boolean
    timeframeUnit?: boolean
    timeframeValue?: boolean
  }, ExtArgs["result"]["ohlcBar"]>

  export type OhlcBarSelectScalar = {
    id?: boolean
    contractId?: boolean
    timestamp?: boolean
    open?: boolean
    high?: boolean
    low?: boolean
    close?: boolean
    volume?: boolean
    timeframeUnit?: boolean
    timeframeValue?: boolean
  }

  export type OhlcBarOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "contractId" | "timestamp" | "open" | "high" | "low" | "close" | "volume" | "timeframeUnit" | "timeframeValue", ExtArgs["result"]["ohlcBar"]>

  export type $OhlcBarPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "OhlcBar"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: number
      contractId: string
      timestamp: Date
      open: number
      high: number
      low: number
      close: number
      volume: number | null
      timeframeUnit: number
      timeframeValue: number
    }, ExtArgs["result"]["ohlcBar"]>
    composites: {}
  }

  type OhlcBarGetPayload<S extends boolean | null | undefined | OhlcBarDefaultArgs> = $Result.GetResult<Prisma.$OhlcBarPayload, S>

  type OhlcBarCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<OhlcBarFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: OhlcBarCountAggregateInputType | true
    }

  export interface OhlcBarDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['OhlcBar'], meta: { name: 'OhlcBar' } }
    /**
     * Find zero or one OhlcBar that matches the filter.
     * @param {OhlcBarFindUniqueArgs} args - Arguments to find a OhlcBar
     * @example
     * // Get one OhlcBar
     * const ohlcBar = await prisma.ohlcBar.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends OhlcBarFindUniqueArgs>(args: SelectSubset<T, OhlcBarFindUniqueArgs<ExtArgs>>): Prisma__OhlcBarClient<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one OhlcBar that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {OhlcBarFindUniqueOrThrowArgs} args - Arguments to find a OhlcBar
     * @example
     * // Get one OhlcBar
     * const ohlcBar = await prisma.ohlcBar.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends OhlcBarFindUniqueOrThrowArgs>(args: SelectSubset<T, OhlcBarFindUniqueOrThrowArgs<ExtArgs>>): Prisma__OhlcBarClient<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first OhlcBar that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OhlcBarFindFirstArgs} args - Arguments to find a OhlcBar
     * @example
     * // Get one OhlcBar
     * const ohlcBar = await prisma.ohlcBar.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends OhlcBarFindFirstArgs>(args?: SelectSubset<T, OhlcBarFindFirstArgs<ExtArgs>>): Prisma__OhlcBarClient<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first OhlcBar that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OhlcBarFindFirstOrThrowArgs} args - Arguments to find a OhlcBar
     * @example
     * // Get one OhlcBar
     * const ohlcBar = await prisma.ohlcBar.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends OhlcBarFindFirstOrThrowArgs>(args?: SelectSubset<T, OhlcBarFindFirstOrThrowArgs<ExtArgs>>): Prisma__OhlcBarClient<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more OhlcBars that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OhlcBarFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all OhlcBars
     * const ohlcBars = await prisma.ohlcBar.findMany()
     * 
     * // Get first 10 OhlcBars
     * const ohlcBars = await prisma.ohlcBar.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const ohlcBarWithIdOnly = await prisma.ohlcBar.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends OhlcBarFindManyArgs>(args?: SelectSubset<T, OhlcBarFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a OhlcBar.
     * @param {OhlcBarCreateArgs} args - Arguments to create a OhlcBar.
     * @example
     * // Create one OhlcBar
     * const OhlcBar = await prisma.ohlcBar.create({
     *   data: {
     *     // ... data to create a OhlcBar
     *   }
     * })
     * 
     */
    create<T extends OhlcBarCreateArgs>(args: SelectSubset<T, OhlcBarCreateArgs<ExtArgs>>): Prisma__OhlcBarClient<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many OhlcBars.
     * @param {OhlcBarCreateManyArgs} args - Arguments to create many OhlcBars.
     * @example
     * // Create many OhlcBars
     * const ohlcBar = await prisma.ohlcBar.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends OhlcBarCreateManyArgs>(args?: SelectSubset<T, OhlcBarCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many OhlcBars and returns the data saved in the database.
     * @param {OhlcBarCreateManyAndReturnArgs} args - Arguments to create many OhlcBars.
     * @example
     * // Create many OhlcBars
     * const ohlcBar = await prisma.ohlcBar.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many OhlcBars and only return the `id`
     * const ohlcBarWithIdOnly = await prisma.ohlcBar.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends OhlcBarCreateManyAndReturnArgs>(args?: SelectSubset<T, OhlcBarCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a OhlcBar.
     * @param {OhlcBarDeleteArgs} args - Arguments to delete one OhlcBar.
     * @example
     * // Delete one OhlcBar
     * const OhlcBar = await prisma.ohlcBar.delete({
     *   where: {
     *     // ... filter to delete one OhlcBar
     *   }
     * })
     * 
     */
    delete<T extends OhlcBarDeleteArgs>(args: SelectSubset<T, OhlcBarDeleteArgs<ExtArgs>>): Prisma__OhlcBarClient<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one OhlcBar.
     * @param {OhlcBarUpdateArgs} args - Arguments to update one OhlcBar.
     * @example
     * // Update one OhlcBar
     * const ohlcBar = await prisma.ohlcBar.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends OhlcBarUpdateArgs>(args: SelectSubset<T, OhlcBarUpdateArgs<ExtArgs>>): Prisma__OhlcBarClient<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more OhlcBars.
     * @param {OhlcBarDeleteManyArgs} args - Arguments to filter OhlcBars to delete.
     * @example
     * // Delete a few OhlcBars
     * const { count } = await prisma.ohlcBar.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends OhlcBarDeleteManyArgs>(args?: SelectSubset<T, OhlcBarDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more OhlcBars.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OhlcBarUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many OhlcBars
     * const ohlcBar = await prisma.ohlcBar.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends OhlcBarUpdateManyArgs>(args: SelectSubset<T, OhlcBarUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more OhlcBars and returns the data updated in the database.
     * @param {OhlcBarUpdateManyAndReturnArgs} args - Arguments to update many OhlcBars.
     * @example
     * // Update many OhlcBars
     * const ohlcBar = await prisma.ohlcBar.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more OhlcBars and only return the `id`
     * const ohlcBarWithIdOnly = await prisma.ohlcBar.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends OhlcBarUpdateManyAndReturnArgs>(args: SelectSubset<T, OhlcBarUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one OhlcBar.
     * @param {OhlcBarUpsertArgs} args - Arguments to update or create a OhlcBar.
     * @example
     * // Update or create a OhlcBar
     * const ohlcBar = await prisma.ohlcBar.upsert({
     *   create: {
     *     // ... data to create a OhlcBar
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the OhlcBar we want to update
     *   }
     * })
     */
    upsert<T extends OhlcBarUpsertArgs>(args: SelectSubset<T, OhlcBarUpsertArgs<ExtArgs>>): Prisma__OhlcBarClient<$Result.GetResult<Prisma.$OhlcBarPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of OhlcBars.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OhlcBarCountArgs} args - Arguments to filter OhlcBars to count.
     * @example
     * // Count the number of OhlcBars
     * const count = await prisma.ohlcBar.count({
     *   where: {
     *     // ... the filter for the OhlcBars we want to count
     *   }
     * })
    **/
    count<T extends OhlcBarCountArgs>(
      args?: Subset<T, OhlcBarCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], OhlcBarCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a OhlcBar.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OhlcBarAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends OhlcBarAggregateArgs>(args: Subset<T, OhlcBarAggregateArgs>): Prisma.PrismaPromise<GetOhlcBarAggregateType<T>>

    /**
     * Group by OhlcBar.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OhlcBarGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends OhlcBarGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: OhlcBarGroupByArgs['orderBy'] }
        : { orderBy?: OhlcBarGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, OhlcBarGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetOhlcBarGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the OhlcBar model
   */
  readonly fields: OhlcBarFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for OhlcBar.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__OhlcBarClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the OhlcBar model
   */
  interface OhlcBarFieldRefs {
    readonly id: FieldRef<"OhlcBar", 'Int'>
    readonly contractId: FieldRef<"OhlcBar", 'String'>
    readonly timestamp: FieldRef<"OhlcBar", 'DateTime'>
    readonly open: FieldRef<"OhlcBar", 'Float'>
    readonly high: FieldRef<"OhlcBar", 'Float'>
    readonly low: FieldRef<"OhlcBar", 'Float'>
    readonly close: FieldRef<"OhlcBar", 'Float'>
    readonly volume: FieldRef<"OhlcBar", 'Float'>
    readonly timeframeUnit: FieldRef<"OhlcBar", 'Int'>
    readonly timeframeValue: FieldRef<"OhlcBar", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * OhlcBar findUnique
   */
  export type OhlcBarFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * Filter, which OhlcBar to fetch.
     */
    where: OhlcBarWhereUniqueInput
  }

  /**
   * OhlcBar findUniqueOrThrow
   */
  export type OhlcBarFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * Filter, which OhlcBar to fetch.
     */
    where: OhlcBarWhereUniqueInput
  }

  /**
   * OhlcBar findFirst
   */
  export type OhlcBarFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * Filter, which OhlcBar to fetch.
     */
    where?: OhlcBarWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OhlcBars to fetch.
     */
    orderBy?: OhlcBarOrderByWithRelationInput | OhlcBarOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for OhlcBars.
     */
    cursor?: OhlcBarWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OhlcBars from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OhlcBars.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of OhlcBars.
     */
    distinct?: OhlcBarScalarFieldEnum | OhlcBarScalarFieldEnum[]
  }

  /**
   * OhlcBar findFirstOrThrow
   */
  export type OhlcBarFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * Filter, which OhlcBar to fetch.
     */
    where?: OhlcBarWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OhlcBars to fetch.
     */
    orderBy?: OhlcBarOrderByWithRelationInput | OhlcBarOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for OhlcBars.
     */
    cursor?: OhlcBarWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OhlcBars from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OhlcBars.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of OhlcBars.
     */
    distinct?: OhlcBarScalarFieldEnum | OhlcBarScalarFieldEnum[]
  }

  /**
   * OhlcBar findMany
   */
  export type OhlcBarFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * Filter, which OhlcBars to fetch.
     */
    where?: OhlcBarWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OhlcBars to fetch.
     */
    orderBy?: OhlcBarOrderByWithRelationInput | OhlcBarOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing OhlcBars.
     */
    cursor?: OhlcBarWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OhlcBars from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OhlcBars.
     */
    skip?: number
    distinct?: OhlcBarScalarFieldEnum | OhlcBarScalarFieldEnum[]
  }

  /**
   * OhlcBar create
   */
  export type OhlcBarCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * The data needed to create a OhlcBar.
     */
    data: XOR<OhlcBarCreateInput, OhlcBarUncheckedCreateInput>
  }

  /**
   * OhlcBar createMany
   */
  export type OhlcBarCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many OhlcBars.
     */
    data: OhlcBarCreateManyInput | OhlcBarCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * OhlcBar createManyAndReturn
   */
  export type OhlcBarCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * The data used to create many OhlcBars.
     */
    data: OhlcBarCreateManyInput | OhlcBarCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * OhlcBar update
   */
  export type OhlcBarUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * The data needed to update a OhlcBar.
     */
    data: XOR<OhlcBarUpdateInput, OhlcBarUncheckedUpdateInput>
    /**
     * Choose, which OhlcBar to update.
     */
    where: OhlcBarWhereUniqueInput
  }

  /**
   * OhlcBar updateMany
   */
  export type OhlcBarUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update OhlcBars.
     */
    data: XOR<OhlcBarUpdateManyMutationInput, OhlcBarUncheckedUpdateManyInput>
    /**
     * Filter which OhlcBars to update
     */
    where?: OhlcBarWhereInput
    /**
     * Limit how many OhlcBars to update.
     */
    limit?: number
  }

  /**
   * OhlcBar updateManyAndReturn
   */
  export type OhlcBarUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * The data used to update OhlcBars.
     */
    data: XOR<OhlcBarUpdateManyMutationInput, OhlcBarUncheckedUpdateManyInput>
    /**
     * Filter which OhlcBars to update
     */
    where?: OhlcBarWhereInput
    /**
     * Limit how many OhlcBars to update.
     */
    limit?: number
  }

  /**
   * OhlcBar upsert
   */
  export type OhlcBarUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * The filter to search for the OhlcBar to update in case it exists.
     */
    where: OhlcBarWhereUniqueInput
    /**
     * In case the OhlcBar found by the `where` argument doesn't exist, create a new OhlcBar with this data.
     */
    create: XOR<OhlcBarCreateInput, OhlcBarUncheckedCreateInput>
    /**
     * In case the OhlcBar was found with the provided `where` argument, update it with this data.
     */
    update: XOR<OhlcBarUpdateInput, OhlcBarUncheckedUpdateInput>
  }

  /**
   * OhlcBar delete
   */
  export type OhlcBarDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
    /**
     * Filter which OhlcBar to delete.
     */
    where: OhlcBarWhereUniqueInput
  }

  /**
   * OhlcBar deleteMany
   */
  export type OhlcBarDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which OhlcBars to delete
     */
    where?: OhlcBarWhereInput
    /**
     * Limit how many OhlcBars to delete.
     */
    limit?: number
  }

  /**
   * OhlcBar without action
   */
  export type OhlcBarDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OhlcBar
     */
    select?: OhlcBarSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OhlcBar
     */
    omit?: OhlcBarOmit<ExtArgs> | null
  }


  /**
   * Model TrendPoint
   */

  export type AggregateTrendPoint = {
    _count: TrendPointCountAggregateOutputType | null
    _avg: TrendPointAvgAggregateOutputType | null
    _sum: TrendPointSumAggregateOutputType | null
    _min: TrendPointMinAggregateOutputType | null
    _max: TrendPointMaxAggregateOutputType | null
  }

  export type TrendPointAvgAggregateOutputType = {
    id: number | null
    price: number | null
  }

  export type TrendPointSumAggregateOutputType = {
    id: number | null
    price: number | null
  }

  export type TrendPointMinAggregateOutputType = {
    id: number | null
    contractId: string | null
    timestamp: Date | null
    price: number | null
    type: string | null
    timeframe: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TrendPointMaxAggregateOutputType = {
    id: number | null
    contractId: string | null
    timestamp: Date | null
    price: number | null
    type: string | null
    timeframe: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TrendPointCountAggregateOutputType = {
    id: number
    contractId: number
    timestamp: number
    price: number
    type: number
    timeframe: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type TrendPointAvgAggregateInputType = {
    id?: true
    price?: true
  }

  export type TrendPointSumAggregateInputType = {
    id?: true
    price?: true
  }

  export type TrendPointMinAggregateInputType = {
    id?: true
    contractId?: true
    timestamp?: true
    price?: true
    type?: true
    timeframe?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TrendPointMaxAggregateInputType = {
    id?: true
    contractId?: true
    timestamp?: true
    price?: true
    type?: true
    timeframe?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TrendPointCountAggregateInputType = {
    id?: true
    contractId?: true
    timestamp?: true
    price?: true
    type?: true
    timeframe?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type TrendPointAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TrendPoint to aggregate.
     */
    where?: TrendPointWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TrendPoints to fetch.
     */
    orderBy?: TrendPointOrderByWithRelationInput | TrendPointOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TrendPointWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TrendPoints from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TrendPoints.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned TrendPoints
    **/
    _count?: true | TrendPointCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TrendPointAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TrendPointSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TrendPointMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TrendPointMaxAggregateInputType
  }

  export type GetTrendPointAggregateType<T extends TrendPointAggregateArgs> = {
        [P in keyof T & keyof AggregateTrendPoint]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTrendPoint[P]>
      : GetScalarType<T[P], AggregateTrendPoint[P]>
  }




  export type TrendPointGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TrendPointWhereInput
    orderBy?: TrendPointOrderByWithAggregationInput | TrendPointOrderByWithAggregationInput[]
    by: TrendPointScalarFieldEnum[] | TrendPointScalarFieldEnum
    having?: TrendPointScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TrendPointCountAggregateInputType | true
    _avg?: TrendPointAvgAggregateInputType
    _sum?: TrendPointSumAggregateInputType
    _min?: TrendPointMinAggregateInputType
    _max?: TrendPointMaxAggregateInputType
  }

  export type TrendPointGroupByOutputType = {
    id: number
    contractId: string
    timestamp: Date
    price: number
    type: string
    timeframe: string
    createdAt: Date
    updatedAt: Date
    _count: TrendPointCountAggregateOutputType | null
    _avg: TrendPointAvgAggregateOutputType | null
    _sum: TrendPointSumAggregateOutputType | null
    _min: TrendPointMinAggregateOutputType | null
    _max: TrendPointMaxAggregateOutputType | null
  }

  type GetTrendPointGroupByPayload<T extends TrendPointGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TrendPointGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TrendPointGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TrendPointGroupByOutputType[P]>
            : GetScalarType<T[P], TrendPointGroupByOutputType[P]>
        }
      >
    >


  export type TrendPointSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    contractId?: boolean
    timestamp?: boolean
    price?: boolean
    type?: boolean
    timeframe?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["trendPoint"]>

  export type TrendPointSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    contractId?: boolean
    timestamp?: boolean
    price?: boolean
    type?: boolean
    timeframe?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["trendPoint"]>

  export type TrendPointSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    contractId?: boolean
    timestamp?: boolean
    price?: boolean
    type?: boolean
    timeframe?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["trendPoint"]>

  export type TrendPointSelectScalar = {
    id?: boolean
    contractId?: boolean
    timestamp?: boolean
    price?: boolean
    type?: boolean
    timeframe?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type TrendPointOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "contractId" | "timestamp" | "price" | "type" | "timeframe" | "createdAt" | "updatedAt", ExtArgs["result"]["trendPoint"]>

  export type $TrendPointPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "TrendPoint"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: number
      contractId: string
      timestamp: Date
      price: number
      type: string
      timeframe: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["trendPoint"]>
    composites: {}
  }

  type TrendPointGetPayload<S extends boolean | null | undefined | TrendPointDefaultArgs> = $Result.GetResult<Prisma.$TrendPointPayload, S>

  type TrendPointCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TrendPointFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TrendPointCountAggregateInputType | true
    }

  export interface TrendPointDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['TrendPoint'], meta: { name: 'TrendPoint' } }
    /**
     * Find zero or one TrendPoint that matches the filter.
     * @param {TrendPointFindUniqueArgs} args - Arguments to find a TrendPoint
     * @example
     * // Get one TrendPoint
     * const trendPoint = await prisma.trendPoint.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TrendPointFindUniqueArgs>(args: SelectSubset<T, TrendPointFindUniqueArgs<ExtArgs>>): Prisma__TrendPointClient<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one TrendPoint that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TrendPointFindUniqueOrThrowArgs} args - Arguments to find a TrendPoint
     * @example
     * // Get one TrendPoint
     * const trendPoint = await prisma.trendPoint.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TrendPointFindUniqueOrThrowArgs>(args: SelectSubset<T, TrendPointFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TrendPointClient<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TrendPoint that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendPointFindFirstArgs} args - Arguments to find a TrendPoint
     * @example
     * // Get one TrendPoint
     * const trendPoint = await prisma.trendPoint.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TrendPointFindFirstArgs>(args?: SelectSubset<T, TrendPointFindFirstArgs<ExtArgs>>): Prisma__TrendPointClient<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TrendPoint that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendPointFindFirstOrThrowArgs} args - Arguments to find a TrendPoint
     * @example
     * // Get one TrendPoint
     * const trendPoint = await prisma.trendPoint.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TrendPointFindFirstOrThrowArgs>(args?: SelectSubset<T, TrendPointFindFirstOrThrowArgs<ExtArgs>>): Prisma__TrendPointClient<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more TrendPoints that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendPointFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all TrendPoints
     * const trendPoints = await prisma.trendPoint.findMany()
     * 
     * // Get first 10 TrendPoints
     * const trendPoints = await prisma.trendPoint.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const trendPointWithIdOnly = await prisma.trendPoint.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TrendPointFindManyArgs>(args?: SelectSubset<T, TrendPointFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a TrendPoint.
     * @param {TrendPointCreateArgs} args - Arguments to create a TrendPoint.
     * @example
     * // Create one TrendPoint
     * const TrendPoint = await prisma.trendPoint.create({
     *   data: {
     *     // ... data to create a TrendPoint
     *   }
     * })
     * 
     */
    create<T extends TrendPointCreateArgs>(args: SelectSubset<T, TrendPointCreateArgs<ExtArgs>>): Prisma__TrendPointClient<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many TrendPoints.
     * @param {TrendPointCreateManyArgs} args - Arguments to create many TrendPoints.
     * @example
     * // Create many TrendPoints
     * const trendPoint = await prisma.trendPoint.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TrendPointCreateManyArgs>(args?: SelectSubset<T, TrendPointCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many TrendPoints and returns the data saved in the database.
     * @param {TrendPointCreateManyAndReturnArgs} args - Arguments to create many TrendPoints.
     * @example
     * // Create many TrendPoints
     * const trendPoint = await prisma.trendPoint.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many TrendPoints and only return the `id`
     * const trendPointWithIdOnly = await prisma.trendPoint.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TrendPointCreateManyAndReturnArgs>(args?: SelectSubset<T, TrendPointCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a TrendPoint.
     * @param {TrendPointDeleteArgs} args - Arguments to delete one TrendPoint.
     * @example
     * // Delete one TrendPoint
     * const TrendPoint = await prisma.trendPoint.delete({
     *   where: {
     *     // ... filter to delete one TrendPoint
     *   }
     * })
     * 
     */
    delete<T extends TrendPointDeleteArgs>(args: SelectSubset<T, TrendPointDeleteArgs<ExtArgs>>): Prisma__TrendPointClient<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one TrendPoint.
     * @param {TrendPointUpdateArgs} args - Arguments to update one TrendPoint.
     * @example
     * // Update one TrendPoint
     * const trendPoint = await prisma.trendPoint.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TrendPointUpdateArgs>(args: SelectSubset<T, TrendPointUpdateArgs<ExtArgs>>): Prisma__TrendPointClient<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more TrendPoints.
     * @param {TrendPointDeleteManyArgs} args - Arguments to filter TrendPoints to delete.
     * @example
     * // Delete a few TrendPoints
     * const { count } = await prisma.trendPoint.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TrendPointDeleteManyArgs>(args?: SelectSubset<T, TrendPointDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TrendPoints.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendPointUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many TrendPoints
     * const trendPoint = await prisma.trendPoint.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TrendPointUpdateManyArgs>(args: SelectSubset<T, TrendPointUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TrendPoints and returns the data updated in the database.
     * @param {TrendPointUpdateManyAndReturnArgs} args - Arguments to update many TrendPoints.
     * @example
     * // Update many TrendPoints
     * const trendPoint = await prisma.trendPoint.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more TrendPoints and only return the `id`
     * const trendPointWithIdOnly = await prisma.trendPoint.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TrendPointUpdateManyAndReturnArgs>(args: SelectSubset<T, TrendPointUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one TrendPoint.
     * @param {TrendPointUpsertArgs} args - Arguments to update or create a TrendPoint.
     * @example
     * // Update or create a TrendPoint
     * const trendPoint = await prisma.trendPoint.upsert({
     *   create: {
     *     // ... data to create a TrendPoint
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the TrendPoint we want to update
     *   }
     * })
     */
    upsert<T extends TrendPointUpsertArgs>(args: SelectSubset<T, TrendPointUpsertArgs<ExtArgs>>): Prisma__TrendPointClient<$Result.GetResult<Prisma.$TrendPointPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of TrendPoints.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendPointCountArgs} args - Arguments to filter TrendPoints to count.
     * @example
     * // Count the number of TrendPoints
     * const count = await prisma.trendPoint.count({
     *   where: {
     *     // ... the filter for the TrendPoints we want to count
     *   }
     * })
    **/
    count<T extends TrendPointCountArgs>(
      args?: Subset<T, TrendPointCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TrendPointCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a TrendPoint.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendPointAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TrendPointAggregateArgs>(args: Subset<T, TrendPointAggregateArgs>): Prisma.PrismaPromise<GetTrendPointAggregateType<T>>

    /**
     * Group by TrendPoint.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendPointGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TrendPointGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TrendPointGroupByArgs['orderBy'] }
        : { orderBy?: TrendPointGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TrendPointGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTrendPointGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the TrendPoint model
   */
  readonly fields: TrendPointFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for TrendPoint.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TrendPointClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the TrendPoint model
   */
  interface TrendPointFieldRefs {
    readonly id: FieldRef<"TrendPoint", 'Int'>
    readonly contractId: FieldRef<"TrendPoint", 'String'>
    readonly timestamp: FieldRef<"TrendPoint", 'DateTime'>
    readonly price: FieldRef<"TrendPoint", 'Float'>
    readonly type: FieldRef<"TrendPoint", 'String'>
    readonly timeframe: FieldRef<"TrendPoint", 'String'>
    readonly createdAt: FieldRef<"TrendPoint", 'DateTime'>
    readonly updatedAt: FieldRef<"TrendPoint", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * TrendPoint findUnique
   */
  export type TrendPointFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * Filter, which TrendPoint to fetch.
     */
    where: TrendPointWhereUniqueInput
  }

  /**
   * TrendPoint findUniqueOrThrow
   */
  export type TrendPointFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * Filter, which TrendPoint to fetch.
     */
    where: TrendPointWhereUniqueInput
  }

  /**
   * TrendPoint findFirst
   */
  export type TrendPointFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * Filter, which TrendPoint to fetch.
     */
    where?: TrendPointWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TrendPoints to fetch.
     */
    orderBy?: TrendPointOrderByWithRelationInput | TrendPointOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TrendPoints.
     */
    cursor?: TrendPointWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TrendPoints from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TrendPoints.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TrendPoints.
     */
    distinct?: TrendPointScalarFieldEnum | TrendPointScalarFieldEnum[]
  }

  /**
   * TrendPoint findFirstOrThrow
   */
  export type TrendPointFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * Filter, which TrendPoint to fetch.
     */
    where?: TrendPointWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TrendPoints to fetch.
     */
    orderBy?: TrendPointOrderByWithRelationInput | TrendPointOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TrendPoints.
     */
    cursor?: TrendPointWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TrendPoints from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TrendPoints.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TrendPoints.
     */
    distinct?: TrendPointScalarFieldEnum | TrendPointScalarFieldEnum[]
  }

  /**
   * TrendPoint findMany
   */
  export type TrendPointFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * Filter, which TrendPoints to fetch.
     */
    where?: TrendPointWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TrendPoints to fetch.
     */
    orderBy?: TrendPointOrderByWithRelationInput | TrendPointOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing TrendPoints.
     */
    cursor?: TrendPointWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TrendPoints from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TrendPoints.
     */
    skip?: number
    distinct?: TrendPointScalarFieldEnum | TrendPointScalarFieldEnum[]
  }

  /**
   * TrendPoint create
   */
  export type TrendPointCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * The data needed to create a TrendPoint.
     */
    data: XOR<TrendPointCreateInput, TrendPointUncheckedCreateInput>
  }

  /**
   * TrendPoint createMany
   */
  export type TrendPointCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many TrendPoints.
     */
    data: TrendPointCreateManyInput | TrendPointCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TrendPoint createManyAndReturn
   */
  export type TrendPointCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * The data used to create many TrendPoints.
     */
    data: TrendPointCreateManyInput | TrendPointCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TrendPoint update
   */
  export type TrendPointUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * The data needed to update a TrendPoint.
     */
    data: XOR<TrendPointUpdateInput, TrendPointUncheckedUpdateInput>
    /**
     * Choose, which TrendPoint to update.
     */
    where: TrendPointWhereUniqueInput
  }

  /**
   * TrendPoint updateMany
   */
  export type TrendPointUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update TrendPoints.
     */
    data: XOR<TrendPointUpdateManyMutationInput, TrendPointUncheckedUpdateManyInput>
    /**
     * Filter which TrendPoints to update
     */
    where?: TrendPointWhereInput
    /**
     * Limit how many TrendPoints to update.
     */
    limit?: number
  }

  /**
   * TrendPoint updateManyAndReturn
   */
  export type TrendPointUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * The data used to update TrendPoints.
     */
    data: XOR<TrendPointUpdateManyMutationInput, TrendPointUncheckedUpdateManyInput>
    /**
     * Filter which TrendPoints to update
     */
    where?: TrendPointWhereInput
    /**
     * Limit how many TrendPoints to update.
     */
    limit?: number
  }

  /**
   * TrendPoint upsert
   */
  export type TrendPointUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * The filter to search for the TrendPoint to update in case it exists.
     */
    where: TrendPointWhereUniqueInput
    /**
     * In case the TrendPoint found by the `where` argument doesn't exist, create a new TrendPoint with this data.
     */
    create: XOR<TrendPointCreateInput, TrendPointUncheckedCreateInput>
    /**
     * In case the TrendPoint was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TrendPointUpdateInput, TrendPointUncheckedUpdateInput>
  }

  /**
   * TrendPoint delete
   */
  export type TrendPointDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
    /**
     * Filter which TrendPoint to delete.
     */
    where: TrendPointWhereUniqueInput
  }

  /**
   * TrendPoint deleteMany
   */
  export type TrendPointDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TrendPoints to delete
     */
    where?: TrendPointWhereInput
    /**
     * Limit how many TrendPoints to delete.
     */
    limit?: number
  }

  /**
   * TrendPoint without action
   */
  export type TrendPointDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TrendPoint
     */
    select?: TrendPointSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TrendPoint
     */
    omit?: TrendPointOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const OhlcBarScalarFieldEnum: {
    id: 'id',
    contractId: 'contractId',
    timestamp: 'timestamp',
    open: 'open',
    high: 'high',
    low: 'low',
    close: 'close',
    volume: 'volume',
    timeframeUnit: 'timeframeUnit',
    timeframeValue: 'timeframeValue'
  };

  export type OhlcBarScalarFieldEnum = (typeof OhlcBarScalarFieldEnum)[keyof typeof OhlcBarScalarFieldEnum]


  export const TrendPointScalarFieldEnum: {
    id: 'id',
    contractId: 'contractId',
    timestamp: 'timestamp',
    price: 'price',
    type: 'type',
    timeframe: 'timeframe',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type TrendPointScalarFieldEnum = (typeof TrendPointScalarFieldEnum)[keyof typeof TrendPointScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type OhlcBarWhereInput = {
    AND?: OhlcBarWhereInput | OhlcBarWhereInput[]
    OR?: OhlcBarWhereInput[]
    NOT?: OhlcBarWhereInput | OhlcBarWhereInput[]
    id?: IntFilter<"OhlcBar"> | number
    contractId?: StringFilter<"OhlcBar"> | string
    timestamp?: DateTimeFilter<"OhlcBar"> | Date | string
    open?: FloatFilter<"OhlcBar"> | number
    high?: FloatFilter<"OhlcBar"> | number
    low?: FloatFilter<"OhlcBar"> | number
    close?: FloatFilter<"OhlcBar"> | number
    volume?: FloatNullableFilter<"OhlcBar"> | number | null
    timeframeUnit?: IntFilter<"OhlcBar"> | number
    timeframeValue?: IntFilter<"OhlcBar"> | number
  }

  export type OhlcBarOrderByWithRelationInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    open?: SortOrder
    high?: SortOrder
    low?: SortOrder
    close?: SortOrder
    volume?: SortOrderInput | SortOrder
    timeframeUnit?: SortOrder
    timeframeValue?: SortOrder
  }

  export type OhlcBarWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: OhlcBarWhereInput | OhlcBarWhereInput[]
    OR?: OhlcBarWhereInput[]
    NOT?: OhlcBarWhereInput | OhlcBarWhereInput[]
    contractId?: StringFilter<"OhlcBar"> | string
    timestamp?: DateTimeFilter<"OhlcBar"> | Date | string
    open?: FloatFilter<"OhlcBar"> | number
    high?: FloatFilter<"OhlcBar"> | number
    low?: FloatFilter<"OhlcBar"> | number
    close?: FloatFilter<"OhlcBar"> | number
    volume?: FloatNullableFilter<"OhlcBar"> | number | null
    timeframeUnit?: IntFilter<"OhlcBar"> | number
    timeframeValue?: IntFilter<"OhlcBar"> | number
  }, "id">

  export type OhlcBarOrderByWithAggregationInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    open?: SortOrder
    high?: SortOrder
    low?: SortOrder
    close?: SortOrder
    volume?: SortOrderInput | SortOrder
    timeframeUnit?: SortOrder
    timeframeValue?: SortOrder
    _count?: OhlcBarCountOrderByAggregateInput
    _avg?: OhlcBarAvgOrderByAggregateInput
    _max?: OhlcBarMaxOrderByAggregateInput
    _min?: OhlcBarMinOrderByAggregateInput
    _sum?: OhlcBarSumOrderByAggregateInput
  }

  export type OhlcBarScalarWhereWithAggregatesInput = {
    AND?: OhlcBarScalarWhereWithAggregatesInput | OhlcBarScalarWhereWithAggregatesInput[]
    OR?: OhlcBarScalarWhereWithAggregatesInput[]
    NOT?: OhlcBarScalarWhereWithAggregatesInput | OhlcBarScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"OhlcBar"> | number
    contractId?: StringWithAggregatesFilter<"OhlcBar"> | string
    timestamp?: DateTimeWithAggregatesFilter<"OhlcBar"> | Date | string
    open?: FloatWithAggregatesFilter<"OhlcBar"> | number
    high?: FloatWithAggregatesFilter<"OhlcBar"> | number
    low?: FloatWithAggregatesFilter<"OhlcBar"> | number
    close?: FloatWithAggregatesFilter<"OhlcBar"> | number
    volume?: FloatNullableWithAggregatesFilter<"OhlcBar"> | number | null
    timeframeUnit?: IntWithAggregatesFilter<"OhlcBar"> | number
    timeframeValue?: IntWithAggregatesFilter<"OhlcBar"> | number
  }

  export type TrendPointWhereInput = {
    AND?: TrendPointWhereInput | TrendPointWhereInput[]
    OR?: TrendPointWhereInput[]
    NOT?: TrendPointWhereInput | TrendPointWhereInput[]
    id?: IntFilter<"TrendPoint"> | number
    contractId?: StringFilter<"TrendPoint"> | string
    timestamp?: DateTimeFilter<"TrendPoint"> | Date | string
    price?: FloatFilter<"TrendPoint"> | number
    type?: StringFilter<"TrendPoint"> | string
    timeframe?: StringFilter<"TrendPoint"> | string
    createdAt?: DateTimeFilter<"TrendPoint"> | Date | string
    updatedAt?: DateTimeFilter<"TrendPoint"> | Date | string
  }

  export type TrendPointOrderByWithRelationInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    price?: SortOrder
    type?: SortOrder
    timeframe?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TrendPointWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: TrendPointWhereInput | TrendPointWhereInput[]
    OR?: TrendPointWhereInput[]
    NOT?: TrendPointWhereInput | TrendPointWhereInput[]
    contractId?: StringFilter<"TrendPoint"> | string
    timestamp?: DateTimeFilter<"TrendPoint"> | Date | string
    price?: FloatFilter<"TrendPoint"> | number
    type?: StringFilter<"TrendPoint"> | string
    timeframe?: StringFilter<"TrendPoint"> | string
    createdAt?: DateTimeFilter<"TrendPoint"> | Date | string
    updatedAt?: DateTimeFilter<"TrendPoint"> | Date | string
  }, "id">

  export type TrendPointOrderByWithAggregationInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    price?: SortOrder
    type?: SortOrder
    timeframe?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: TrendPointCountOrderByAggregateInput
    _avg?: TrendPointAvgOrderByAggregateInput
    _max?: TrendPointMaxOrderByAggregateInput
    _min?: TrendPointMinOrderByAggregateInput
    _sum?: TrendPointSumOrderByAggregateInput
  }

  export type TrendPointScalarWhereWithAggregatesInput = {
    AND?: TrendPointScalarWhereWithAggregatesInput | TrendPointScalarWhereWithAggregatesInput[]
    OR?: TrendPointScalarWhereWithAggregatesInput[]
    NOT?: TrendPointScalarWhereWithAggregatesInput | TrendPointScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"TrendPoint"> | number
    contractId?: StringWithAggregatesFilter<"TrendPoint"> | string
    timestamp?: DateTimeWithAggregatesFilter<"TrendPoint"> | Date | string
    price?: FloatWithAggregatesFilter<"TrendPoint"> | number
    type?: StringWithAggregatesFilter<"TrendPoint"> | string
    timeframe?: StringWithAggregatesFilter<"TrendPoint"> | string
    createdAt?: DateTimeWithAggregatesFilter<"TrendPoint"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"TrendPoint"> | Date | string
  }

  export type OhlcBarCreateInput = {
    contractId: string
    timestamp: Date | string
    open: number
    high: number
    low: number
    close: number
    volume?: number | null
    timeframeUnit: number
    timeframeValue: number
  }

  export type OhlcBarUncheckedCreateInput = {
    id?: number
    contractId: string
    timestamp: Date | string
    open: number
    high: number
    low: number
    close: number
    volume?: number | null
    timeframeUnit: number
    timeframeValue: number
  }

  export type OhlcBarUpdateInput = {
    contractId?: StringFieldUpdateOperationsInput | string
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
    open?: FloatFieldUpdateOperationsInput | number
    high?: FloatFieldUpdateOperationsInput | number
    low?: FloatFieldUpdateOperationsInput | number
    close?: FloatFieldUpdateOperationsInput | number
    volume?: NullableFloatFieldUpdateOperationsInput | number | null
    timeframeUnit?: IntFieldUpdateOperationsInput | number
    timeframeValue?: IntFieldUpdateOperationsInput | number
  }

  export type OhlcBarUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    contractId?: StringFieldUpdateOperationsInput | string
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
    open?: FloatFieldUpdateOperationsInput | number
    high?: FloatFieldUpdateOperationsInput | number
    low?: FloatFieldUpdateOperationsInput | number
    close?: FloatFieldUpdateOperationsInput | number
    volume?: NullableFloatFieldUpdateOperationsInput | number | null
    timeframeUnit?: IntFieldUpdateOperationsInput | number
    timeframeValue?: IntFieldUpdateOperationsInput | number
  }

  export type OhlcBarCreateManyInput = {
    id?: number
    contractId: string
    timestamp: Date | string
    open: number
    high: number
    low: number
    close: number
    volume?: number | null
    timeframeUnit: number
    timeframeValue: number
  }

  export type OhlcBarUpdateManyMutationInput = {
    contractId?: StringFieldUpdateOperationsInput | string
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
    open?: FloatFieldUpdateOperationsInput | number
    high?: FloatFieldUpdateOperationsInput | number
    low?: FloatFieldUpdateOperationsInput | number
    close?: FloatFieldUpdateOperationsInput | number
    volume?: NullableFloatFieldUpdateOperationsInput | number | null
    timeframeUnit?: IntFieldUpdateOperationsInput | number
    timeframeValue?: IntFieldUpdateOperationsInput | number
  }

  export type OhlcBarUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    contractId?: StringFieldUpdateOperationsInput | string
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
    open?: FloatFieldUpdateOperationsInput | number
    high?: FloatFieldUpdateOperationsInput | number
    low?: FloatFieldUpdateOperationsInput | number
    close?: FloatFieldUpdateOperationsInput | number
    volume?: NullableFloatFieldUpdateOperationsInput | number | null
    timeframeUnit?: IntFieldUpdateOperationsInput | number
    timeframeValue?: IntFieldUpdateOperationsInput | number
  }

  export type TrendPointCreateInput = {
    contractId: string
    timestamp: Date | string
    price: number
    type: string
    timeframe: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TrendPointUncheckedCreateInput = {
    id?: number
    contractId: string
    timestamp: Date | string
    price: number
    type: string
    timeframe: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TrendPointUpdateInput = {
    contractId?: StringFieldUpdateOperationsInput | string
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
    price?: FloatFieldUpdateOperationsInput | number
    type?: StringFieldUpdateOperationsInput | string
    timeframe?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TrendPointUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    contractId?: StringFieldUpdateOperationsInput | string
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
    price?: FloatFieldUpdateOperationsInput | number
    type?: StringFieldUpdateOperationsInput | string
    timeframe?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TrendPointCreateManyInput = {
    id?: number
    contractId: string
    timestamp: Date | string
    price: number
    type: string
    timeframe: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TrendPointUpdateManyMutationInput = {
    contractId?: StringFieldUpdateOperationsInput | string
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
    price?: FloatFieldUpdateOperationsInput | number
    type?: StringFieldUpdateOperationsInput | string
    timeframe?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TrendPointUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    contractId?: StringFieldUpdateOperationsInput | string
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string
    price?: FloatFieldUpdateOperationsInput | number
    type?: StringFieldUpdateOperationsInput | string
    timeframe?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type FloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type FloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type OhlcBarCountOrderByAggregateInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    open?: SortOrder
    high?: SortOrder
    low?: SortOrder
    close?: SortOrder
    volume?: SortOrder
    timeframeUnit?: SortOrder
    timeframeValue?: SortOrder
  }

  export type OhlcBarAvgOrderByAggregateInput = {
    id?: SortOrder
    open?: SortOrder
    high?: SortOrder
    low?: SortOrder
    close?: SortOrder
    volume?: SortOrder
    timeframeUnit?: SortOrder
    timeframeValue?: SortOrder
  }

  export type OhlcBarMaxOrderByAggregateInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    open?: SortOrder
    high?: SortOrder
    low?: SortOrder
    close?: SortOrder
    volume?: SortOrder
    timeframeUnit?: SortOrder
    timeframeValue?: SortOrder
  }

  export type OhlcBarMinOrderByAggregateInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    open?: SortOrder
    high?: SortOrder
    low?: SortOrder
    close?: SortOrder
    volume?: SortOrder
    timeframeUnit?: SortOrder
    timeframeValue?: SortOrder
  }

  export type OhlcBarSumOrderByAggregateInput = {
    id?: SortOrder
    open?: SortOrder
    high?: SortOrder
    low?: SortOrder
    close?: SortOrder
    volume?: SortOrder
    timeframeUnit?: SortOrder
    timeframeValue?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type FloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type FloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedFloatNullableFilter<$PrismaModel>
    _min?: NestedFloatNullableFilter<$PrismaModel>
    _max?: NestedFloatNullableFilter<$PrismaModel>
  }

  export type TrendPointCountOrderByAggregateInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    price?: SortOrder
    type?: SortOrder
    timeframe?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TrendPointAvgOrderByAggregateInput = {
    id?: SortOrder
    price?: SortOrder
  }

  export type TrendPointMaxOrderByAggregateInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    price?: SortOrder
    type?: SortOrder
    timeframe?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TrendPointMinOrderByAggregateInput = {
    id?: SortOrder
    contractId?: SortOrder
    timestamp?: SortOrder
    price?: SortOrder
    type?: SortOrder
    timeframe?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TrendPointSumOrderByAggregateInput = {
    id?: SortOrder
    price?: SortOrder
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type FloatFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NullableFloatFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedFloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type NestedFloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedFloatNullableFilter<$PrismaModel>
    _min?: NestedFloatNullableFilter<$PrismaModel>
    _max?: NestedFloatNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}