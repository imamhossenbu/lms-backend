# Backend Guidelines & Standards

These rules are strictly enforced across the `lms-ai-backend` codebase:

---

## 1. Modular Architecture & Clean Code
- Maintain strict separation of concerns across Controllers, Services, Repositories/Prisma, and DTOs.
- Keep controllers thin: handle HTTP request parsing, routing, and response formatting only.
- Encapsulate business logic cleanly within dedicated service methods.

---

## 2. Proper Backend Validation
- Every endpoint receiving body or query data must define a strongly-typed DTO class.
- All DTO fields must use `class-validator` decorators (`@IsEmail()`, `@IsString()`, `@MinLength()`, `@IsNotEmpty()`, `@IsOptional()`) and `class-transformer` (`@Type()`).
- Global `ValidationPipe` with `{ whitelist: true, transform: true, forbidNonWhitelisted: false }` must strictly validate incoming payloads.

---

## 3. Secure Data & Authentication
- Passwords must ALWAYS be hashed using `bcrypt` (minimum 10 salt rounds) before storing in the database.
- Tokens (JWT, OTP, reset tokens) must be properly signed, checked for expiration, and invalidated upon use.
- Return standardized HTTP exceptions (`BadRequestException`, `UnauthorizedException`, `NotFoundException`, `ConflictException`) with clear, informative error messages.

---

## 4. Single Language Policy
- All backend error messages, success responses, and system logs must ALWAYS be in English.
- No multilingual toggle or internationalization responses needed.
