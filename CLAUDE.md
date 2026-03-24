# TypeScript Guidelines

## Type Casting

- Never cast to `any`. Use a typed cast (e.g., `value as SomeType`), `Partial<>`, or a type guard instead.
- If an inline type would be repeated in more than one place, extract it into a named `type` or `interface` instead.

## Mocking Strategy

- **Minimal stubs**: For one-off tests, mock only the interface methods your test needs and cast with `as MyInterface`.
- **Full stubs for shared mocks**: For mocks reused across multiple tests or large interfaces, provide default implementations for all methods. Use a factory/helper function to allow overriding only the needed methods.
- **Use `Partial<>` when appropriate**: Allows optional implementation of interface properties, giving flexibility while keeping some type safety.
- **Reusable pattern**: Create mock factories that provide defaults for all interface properties. Override only what each test cares about to balance conciseness with type safety.
