# 🎓 LMS AI Backend — Next-Gen Learning Management & AI Platform

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini%203.8%20Flash-8E75B2?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
[![Groq](https://img.shields.io/badge/Fallback-Groq%20High--Speed-f55036?style=flat)](https://groq.com/)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Nodemailer](https://img.shields.io/badge/Email-Gmail%20SMTP-EA4335?style=flat&logo=gmail&logoColor=white)](https://nodemailer.com/)
[![Swagger](https://img.shields.io/badge/Docs-Swagger%20OpenAPI%203.0-85EA2D?style=flat&logo=swagger&logoColor=black)](http://localhost:4000/api/docs)
[![SSLCommerz](https://img.shields.io/badge/Payment-SSLCommerz-006A4E?style=flat)](https://sslcommerz.com/)

A comprehensive, scalable, enterprise-grade backend for modern **Learning Management Systems (LMS)** deeply integrated with **Artificial Intelligence (AI)** engines. Built with **NestJS 11**, **TypeScript**, **Prisma ORM 7**, and **PostgreSQL**, this platform provides complete course lifecycle management, live virtual classrooms, real-time video progress tracking, interactive AI tutoring, real-time SSE streaming, automated PDF certificates with QR verification, SSLCommerz checkout, automated PDF invoices with barcodes, and extensive administrative analytics.

---

## 📑 Table of Contents

- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Technology Stack](#-technology-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Environment Configuration](#-environment-configuration)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Installation](#local-installation)
  - [Prisma Database Setup](#prisma-database-setup)
  - [Running the Application](#running-the-application)
- [Swagger Interactive API Documentation](#-swagger-interactive-api-documentation)
- [Docker & Containerized Deployment](#-docker--containerized-deployment)
- [API Reference & Endpoints](#-api-reference--endpoints)
  - [1. Authentication & Security](#1-authentication--security)
  - [2. Users & Profiles](#2-users--profiles)
  - [3. Categories & Courses](#3-categories--courses)
  - [4. Enrollments & Student Dashboard](#4-enrollments--student-dashboard)
  - [5. Curriculum (Modules & Lessons)](#5-curriculum-modules--lessons)
  - [6. Lesson Progress & Video Tracking](#6-lesson-progress--video-tracking)
  - [7. Gemini AI Suite & Tutoring Engine](#7-gemini-ai-suite--tutoring-engine)
  - [8. Quizzes & Assessments](#8-quizzes--assessments)
  - [9. Assignments & Submissions](#9-assignments--submissions)
  - [10. Live Classes & Real-Time Attendance](#10-live-classes--real-time-attendance)
  - [11. Orders, Coupons & SSLCommerz Payments](#11-orders-coupons--sslcommerz-payments)
  - [12. Invoices & Receipts](#12-invoices--receipts)
  - [13. Certificates & Public QR Verification](#13-certificates--public-qr-verification)
  - [14. Community Discussions & Reviews](#14-community-discussions--reviews)
  - [15. Announcements & Notifications](#15-announcements--notifications)
  - [16. Admin & Instructor Analytics](#16-admin--instructor-analytics)
  - [17. Activity Audit Logs & White-Label Settings](#17-activity-audit-logs--white-label-settings)
- [Security & Best Practices](#-security--best-practices)
- [Contributing & License](#-contributing--license)

---

## 🌟 Key Features

### 🔐 1. Authentication & Role-Based Access Control (RBAC)
- **Multi-Role RBAC:** Dedicated roles for `STUDENT`, `TEACHER` / `INSTRUCTOR`, and `ADMIN`.
- **JWT Authentication:** Strict passport strategy with token expiry and role authorization guards.
- **Gmail SMTP (Nodemailer):** Transactional email delivery with automatic account activation upon email verification (`GET /auth/verify?token=...`).
- **Security Lifecycle:** Password resets with time-expiring tokens, security alert emails for password modifications, and sanitized user profiles excluding password hashes.

### 📚 2. Course & Curriculum Architecture
- **Hierarchical Course Structure:** Categories $\rightarrow$ Courses $\rightarrow$ Course Modules $\rightarrow$ Lessons $\rightarrow$ Downloadable Resources.
- **Cloud Media Ingestion Pipeline:** Dedicated endpoints for device-to-cloud thumbnail uploads (`POST /courses/upload-thumbnail`) and multimedia streaming (`POST /courses/upload-media`) using **Cloudinary CDN** with automatic resource type detection (`image`, `video`, `raw` docs).
- **Rich Lesson Content & Multimedia:** Lessons support rich text/HTML instructions (`content`), Cloudinary or external video streams (`videoUrl`), downloadable attachments (`resources`), and `isPreview` toggle flags.
- **Search, Filtering & Pagination:** Full-text search (`?search=...`), category filtering, level filtering, price range (`minPrice`/`maxPrice`), free course filters, sorting (`popular`, `rating`, `priceAsc`, `priceDesc`), and paginated response schemas.
- **Preview & Enrollment Guards:** Free preview lesson support, conditional module locking, and access restriction blocking non-enrolled students from paid lessons.
- **Auto Duration Tracking:** `DurationService` dynamically rolls up lesson durations to module and course totals.

### 🎓 3. Student Dashboard & Enrollment Engine
- **My Courses Dashboard:** `GET /enrollments/my-courses` returns all enrolled courses, progress bars, instructors, and certificates.
- **Free Course Enrollment:** `POST /enrollments/free/:courseId` provides 1-click enrollment for free courses without gateway redirection.
- **Real-Time Enrollment Verification:** `GET /enrollments/:courseId/status` informs the frontend whether to show "Enroll Now" or "Continue Learning".

### 🤖 4. Google Gemini & Groq AI Suite
- **Context-Aware AI Tutor:** `POST /ai/tutor-chat` answers doubts using course description and lesson content as contextual grounding.
- **Real-Time SSE Streaming:** `POST /ai/tutor-chat/stream` streams responses token-by-token (ChatGPT-style typing animation).
- **AI Lesson Summarizer:** `POST /ai/summarize-lesson` generates structured study notes, key takeaways, and action items.
- **AI Flashcard Deck Generator:** `POST /ai/generate-flashcards` produces active recall flashcards with hints.
- **AI MCQ Quiz Generator:** `POST /ai/generate-quiz` generates multiple-choice questions with options, explanations, and marks.
- **AI Course Syllabus Planner:** `POST /ai/generate-course-outline` assists instructors with complete module and lesson curriculum roadmaps.
- **AI Assignment Auto-Evaluator:** `POST /ai/evaluate-assignment` automatically grades submissions and returns constructive strengths/weaknesses.
- **High-Availability Multi-Model Fallback:** Primary inference on **Gemini 3.8 Flash** with automatic fallback to **Groq** (`qwen/qwen3.8-27b`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`).

### 📝 5. Assessments, Quizzes & Assignments
- **Quizzes:** Timed quizzes, pass mark benchmarks, and sanitized question delivery (hides `correctAnswer` from students before attempt submission).
- **Assignments:** Submissions with deadline verification (`dueDate`), file attachments, text answers, and instructor grading.

### 🎥 6. Live Virtual Classrooms & Attendance
- **Live Sessions:** Scheduling, meeting URLs (Zoom / Google Meet), and status management.
- **Attendance Tracking:** Student check-in, periodic heartbeat ping (`PATCH /attendance/ping/:id`), check-out, and total watched duration calculation.

### 💳 7. SSLCommerz Checkout & Dynamic Invoicing
- **SSLCommerz Hosted Checkout:** Automated order creation, coupon validation (percentage and fixed discounts), and payment callbacks (`success`, `fail`, `cancel`).
- **Auto Enrollment & Counter:** Automatically enrolls student and increments `Course.totalStudents` upon payment confirmation.
- **Dynamic PDF Invoices:** Auto-generated PDF receipts using **PDFKit** and **bwip-js** Code128 barcodes with subtotal, discounts, taxes, and order totals.

### 🏆 8. QR-Verified Dynamic Certificates
- **Automated Issuance:** Triggered automatically upon reaching 100% course completion.
- **Vector PDF Certificates:** Generated using **PDFKit** with custom luxury styling, student name, course title, and dynamic verification QR code.
- **Instant Public Verification:** Dedicated public endpoint (`GET /certificate/verify/:code`) enabling employers to verify student credentials.

### 💬 9. Community, Forums & Reviews
- **Discussion Forums:** Course-specific discussion threads with nested replies and resolved status flags.
- **Enrolled Student Review Guard:** Only verified enrolled students can review courses.
- **Auto Rating Recalculation:** Approving or deleting reviews automatically recalculates `Course.ratingAverage`.

### 🛡️ 10. System Auditing, Notifications & Rate Limiting
- **Global Activity Logs:** NestJS interceptor logging all mutations (`POST`, `PATCH`, `PUT`, `DELETE`), user IDs, IP addresses, and actions.
- **Bulk Notifications:** Dynamic templates, user feeds, and bulk read (`PATCH /notification/read-all`).
- **Rate Limiting:** Global `@nestjs/throttler` restricting abuse (120 req/min per IP).

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client[Web & Mobile Clients] -->|HTTP / REST / SSE| Nginx[Nginx Reverse Proxy :80]
    Nginx -->|Proxy Pass :4000| NestApp[NestJS Application Server]
    
    subgraph NestJS Core Architecture
        Throttler[Throttler Guard: 120 req/min]
        Auth[JWT & Passport Strategy]
        RBAC[Roles Guard: Admin / Teacher / Student]
        Audit[Activity Log Interceptor]
        Controllers[API Controllers]
    end
    
    NestApp --> Throttler
    Throttler --> Auth
    Auth --> RBAC
    RBAC --> Audit
    Audit --> Controllers
    
    subgraph Integrated Services & Data Layer
        Controllers -->|Prisma 7 PG Adapter| DB[(PostgreSQL Database)]
        Controllers -->|Gmail SMTP| Mail[Nodemailer Transport]
        Controllers -->|Asset Storage| Cloudinary[Cloudinary Cloud CDN]
        Controllers -->|Payment Gateway| SSLCommerz[SSLCommerz Hosted Gateway]
        Controllers -->|AI Primary Engine| Gemini[Google Gemini 3.8 Flash]
        Controllers -->|AI Fallback Inference| Groq[Groq Multi-Model Engine]
        Controllers -->|PDF Generation| PDFKit[PDFKit QR/Barcode Generator]
    end
```

---

## 💻 Technology Stack

| Layer | Technologies |
|---|---|
| **Runtime & Framework** | [Node.js](https://nodejs.org/) (v20+), [NestJS](https://nestjs.com/) v11.x, Express |
| **Language** | [TypeScript](https://www.typescriptlang.org/) v6.x |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/) (Neon PG Adapter), [Prisma](https://www.prisma.io/) v7.x |
| **Primary AI Engine** | [Google Gemini](https://ai.google.dev/) (`gemini-3.8-flash`) |
| **Fallback AI Engine** | [Groq](https://groq.com/) (`qwen/qwen3.8-27b`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`) |
| **Authentication** | [Passport.js](http://www.passportjs.org/), JWT (`@nestjs/jwt`), Bcrypt |
| **Email Delivery** | [Nodemailer](https://nodemailer.com/) with Gmail SMTP (`smtp.gmail.com:465`) |
| **API Documentation** | [Swagger](https://swagger.io/) OpenAPI 3.0 (`@nestjs/swagger`) |
| **Rate Limiting** | [@nestjs/throttler](https://github.com/nestjs/throttler) (120 req/min per IP) |
| **Asset Storage** | [Cloudinary](https://cloudinary.com/) (Multer upload pipeline) |
| **Payment Gateway** | [SSLCommerz](https://sslcommerz.com/) |
| **Document Generation** | [PDFKit](https://pdfkit.org/), `qrcode`, `bwip-js` (Code128 Barcodes) |
| **Container & Proxy** | [Docker](https://www.docker.com/), [Docker Compose](https://docs.docker.com/compose/), [Nginx](https://nginx.org/) Alpine |

---

## 📁 Project Directory Structure

```text
lms-ai-backend/
├── prisma/
│   ├── schema.prisma            # Prisma database schema definition
│   └── migrations/              # Database migration history
├── src/
│   ├── activity-log/            # System audit logging & global interceptor
│   ├── ai/                      # AI tutoring, summarizer, quizzes & flashcards
│   │   ├── ai-service/          # AiController, AiService (Gemini + Groq SSE)
│   │   └── ai-settings/         # Dynamic model & prompt configuration
│   ├── analytics/               # Admin revenue KPIs & instructor dashboards
│   ├── announcement/            # Course & system announcement services
│   ├── assignment/              # Assignments & student submission reviews
│   ├── attendance/              # Live class attendance & duration tracking
│   ├── auth/                    # Registration, JWT, login & password recovery
│   │   ├── decorators/          # @Roles() decorators
│   │   ├── guards/              # JWT & Role validation guards
│   │   └── mail/                # Nodemailer Gmail SMTP service
│   ├── category/                # Course categorization
│   ├── certificate/             # PDFKit certificate generator & QR verification
│   ├── cloudinary/              # Cloudinary media upload provider
│   ├── coupon/                  # Discount codes & promo engine
│   ├── course/                  # Course CRUD, search, filter & pagination
│   │   └── dto/                 # CreateCourseDto, CourseQueryDto
│   ├── course-module/           # Course curriculum module chapters
│   ├── discussion/              # Course forums, threads & replies
│   ├── Duration/                # Automatic module & course duration aggregation
│   ├── enrollment/              # Student dashboard, my-courses & free enroll
│   ├── invoice/                 # Dynamic PDF invoice generation with barcodes
│   ├── lession/                 # Lesson management & enrollment access guard
│   ├── lession-resource/        # Lesson downloadable assets
│   ├── lesson-progress/         # Video tracking, position & curriculum progress map
│   ├── live-class/              # Virtual classroom sessions
│   ├── notification/            # System notifications, templates & bulk read
│   ├── order/                   # Checkout, order creation & pricing calculations
│   ├── payment/                 # SSLCommerz payment gateway integration
│   ├── prisma/                  # PrismaClient service & module
│   ├── quiz/                    # Quiz creation, questions & auto-scoring
│   ├── quiz-question/           # Quiz question management
│   ├── review/                  # Student feedback, enrollment guard & auto-ratings
│   ├── settings/                # White-label site branding & themes
│   ├── user/                    # User profile, role & status management
│   ├── app.module.ts            # Root application module with Throttler & routes
│   └── main.ts                  # NestJS bootstrap entrypoint with Swagger & CORS
├── Dockerfile                   # Multi-stage production container build
├── docker-compose.yml           # App + Nginx reverse proxy orchestration
├── nginx.conf                   # Nginx reverse proxy routing
├── package.json                 # Project dependencies & scripts
├── tsconfig.json                # TypeScript compiler configuration
└── .env.example                 # Environment variables blueprint
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Configure your credentials:

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | Application server port | `4000` |
| `BACKEND_URL` | Public backend base URL | `http://localhost:4000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname?sslmode=require` |
| `SUPER_SECRET_KEY` | Secret key for signing JWT tokens | `your-secure-random-jwt-secret-key` |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `GROQ_API_KEY` | Groq LLM API Key (High-speed fallback) | `gsk_...` |
| `EMAIL_USER` | Gmail address for SMTP email delivery | `your.email@gmail.com` |
| `EMAIL_PASS` | Google App Password (16 characters) | `xxxx xxxx xxxx xxxx` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | `your-api-key` |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | `your-api-secret` |
| `SSL_STORE_ID` | SSLCommerz Merchant Store ID | `your_store_id` |
| `SSL_STORE_PASSWORD` | SSLCommerz Merchant Store Password | `your_store_password` |
| `SSL_IS_SANDBOX` | SSLCommerz Sandbox mode toggle | `true` |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **PostgreSQL**: Local instance or cloud database (e.g., [Neon](https://neon.tech), [Supabase](https://supabase.com))

### Local Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/imamhossenbu/lms-backend.git
   cd lms-backend
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   # Update .env with your credentials
   ```

### Prisma Database Setup

1. **Generate the Prisma client:**
   ```bash
   npx prisma generate
   ```

2. **Sync the schema with your database:**
   ```bash
   npx prisma db push
   ```

3. *(Optional)* **Explore your database using Prisma Studio:**
   ```bash
   npx prisma studio
   ```

### Running the Application

```bash
# Start development server with auto-reload
npm run dev

# Build production TypeScript bundle
npm run build

# Start production server
npm run start
```

The application will launch on **`http://localhost:4000`**.

---

## 📑 Swagger Interactive API Documentation

Interactive OpenAPI 3.0 documentation is auto-generated and available at:

👉 **[http://localhost:4000/api/docs](http://localhost:4000/api/docs)**

You can test every endpoint directly from the Swagger UI, complete with Bearer JWT authentication, request schemas, and live responses.

---

## 🔄 Automated CI/CD Pipeline (GitHub Actions)

A fully automated **GitHub Actions CI/CD pipeline** is configured in [`.github/workflows/ci-cd.yml`](file:///.github/workflows/ci-cd.yml):

```mermaid
graph LR
    Push[Git Push / PR to main] --> Job1[1. ci-build: Node 20 + Prisma + TypeScript Build]
    Job1 --> Job2[2. docker-build: Docker Build & Verification]
    Job2 --> Job3[3. cd-deploy: Production Deployment Stage]
```

### CI/CD Workflow Stages:
1. **`ci-build` (Continuous Integration):**
   - Runs on `ubuntu-latest` with Node.js 20.x.
   - Restores npm cache and installs packages.
   - Generates Prisma client bindings (`npx prisma generate`).
   - Verifies zero TypeScript compilation errors (`npm run build`).
2. **`docker-build` (Container Verification):**
   - Sets up Docker Buildx with GitHub Actions layer caching.
   - Compiles and tests the multi-stage `Dockerfile` to guarantee reproducibility.
3. **`cd-deploy` (Continuous Deployment):**
   - Triggers automatically upon merging to the `main` branch.
   - Supports automated webhooks (Render / Railway / CapRover) or SSH runner deployments.

---

## 🐳 Docker & High-Performance Nginx Reverse Proxy

The application includes a production-ready, multi-stage Docker setup orchestrated with **Nginx** reverse proxy in [`docker-compose.yml`](file:///docker-compose.yml):

### Key Nginx Features ([`nginx.conf`](file:///nginx.conf)):
- **Real-Time SSE Streaming (`/ai/tutor-chat/stream`):** Configured with `proxy_buffering off;`, `proxy_cache off;`, and `chunked_transfer_encoding off;` so that AI responses stream smoothly to clients token-by-token.
- **Large Payload Support:** Configured with `client_max_body_size 100M;` to support video uploads, course assets, and PDF submissions.
- **Gzip Compression:** Automatically compresses JSON, JS, CSS, and API responses to minimize bandwidth and accelerate mobile load times.
- **Security Headers:** Enforces `X-Frame-Options`, `X-Content-Type-Options: nosniff`, and `X-XSS-Protection`.

### Run with Docker Compose:

```bash
# Build and start all containers in detached mode
docker-compose up --build -d

# View real-time application and Nginx logs
docker-compose logs -f

# Check container health status
docker-compose ps

# Stop all containers
docker-compose down
```

---

## 📡 API Reference & Endpoints

All protected endpoints require an `Authorization` header with a valid Bearer token:
```http
Authorization: Bearer <your_jwt_token>
```

### 1. Authentication & Security
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register user & dispatch Gmail verification link |
| `POST` | `/auth/login` | Public | Authenticate user & retrieve JWT token |
| `GET` | `/auth/verify?token=...` | Public | Verify email & auto-activate account (`ACTIVE`) |
| `POST` | `/auth/forgot-password` | Public | Send password reset link to user's email |
| `POST` | `/auth/reset-password` | Public | Reset password using verified token |
| `POST` | `/auth/change-password` | Authenticated | Change current password (sends security alert email) |

### 2. Users & Profiles
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/user/me` | Authenticated | Get sanitized profile (password hash omitted) |
| `PATCH` | `/user/profile` | Authenticated | Update user bio, education & upload avatar |
| `PATCH` | `/user/change-password` | Authenticated | Change account password |
| `GET` | `/user/all` | `ADMIN` | List all registered users |
| `PATCH` | `/user/admin/change-role` | `ADMIN` | Change role (`STUDENT`, `TEACHER`, `ADMIN`) |
| `PATCH` | `/user/admin/change-status`| `ADMIN` | Toggle user status (`ACTIVE`, `BLOCKED`) |
| `DELETE` | `/user/admin/:id` | `ADMIN` | Delete a user account |

### 3. Categories & Courses
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/categories` | Public | Fetch all categories |
| `POST` | `/categories` | `ADMIN` | Create course category |
| `GET` | `/courses` | Public | **Search, filter & paginate courses** (`?search=&categoryId=&level=&isFree=&minPrice=&maxPrice=&sortBy=&page=&limit=`) |
| `GET` | `/courses/:id` | Public | Full course curriculum details with modules & lessons |
| `POST` | `/courses` | `ADMIN`, `TEACHER` | Create course with Cloudinary thumbnail |
| `PATCH` | `/courses/:id` | `ADMIN`, `TEACHER` | Update course details and thumbnail |
| `DELETE` | `/courses/:id` | `ADMIN`, `TEACHER` | Delete a course |
| `POST` | `/courses/upload-thumbnail` | `ADMIN`, `TEACHER` | Upload course thumbnail directly to Cloudinary CDN (`multipart/form-data`) |
| `POST` | `/courses/upload-media` | `ADMIN`, `TEACHER` | Upload lesson video, document, or audio to Cloudinary CDN (`auto` streaming) |

### 4. Enrollments & Student Dashboard
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/enrollments/my-courses` | Authenticated | **Student's enrolled courses with progress bar & certificate** |
| `GET` | `/enrollments/:courseId/status`| Authenticated | **Check if student is already enrolled in a course** |
| `POST` | `/enrollments/free/:courseId` | Authenticated | **1-click direct enrollment for free courses** |

### 5. Curriculum (Modules & Lessons)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/courses/:courseId/modules` | Public / Enrolled | Fetch all modules with nested lessons for a course |
| `POST` | `/courses/:courseId/modules` | `ADMIN`, `TEACHER` | Create a curriculum module (title, order, isLocked) |
| `PATCH` | `/courses/:courseId/modules/:id` | `ADMIN`, `TEACHER` | Update module details or reorder |
| `DELETE` | `/courses/:courseId/modules/:id` | `ADMIN`, `TEACHER` | Delete module |
| `GET` | `/lessons/:id` | Enrolled / Preview | Fetch lesson content with **Enrollment Access Guard** |
| `POST` | `/lessons` | `ADMIN`, `TEACHER` | Create lesson (`title`, `type`, `durationMinutes`, `content`, `videoUrl`, `resources`, `isPreview`) |
| `PATCH` | `/lessons/:id` | `ADMIN`, `TEACHER` | Update lesson content, video link, and metadata |
| `DELETE` | `/lessons/:id` | `ADMIN`, `TEACHER` | Delete lesson |
| `POST` | `/lession-resource` | `ADMIN`, `TEACHER` | Upload downloadable lesson resources |
| `GET` | `/lession-resource/:lessonId` | Enrolled | Fetch lesson downloadable attachments |

### 6. Lesson Progress & Video Tracking
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/progress/course/:courseId` | Authenticated | **Completed lesson IDs checklist for curriculum sidebar** |
| `PATCH` | `/progress/:lessonId/video` | Authenticated | Sync video watched minutes & position |
| `PATCH` | `/progress/:lessonId/complete` | Authenticated | Mark lesson as 100% completed |

### 7. Gemini AI Suite & Tutoring Engine
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/ai/tutor-chat` | Authenticated | **AI Tutor Doubt Solver** with curriculum context |
| `POST` | `/ai/tutor-chat/stream` | Authenticated | **Real-time SSE streaming chat** (token-by-token) |
| `POST` | `/ai/summarize-lesson` | Authenticated | **AI Lesson Summarizer** (structured study notes & takeaways) |
| `POST` | `/ai/generate-flashcards` | Authenticated | **AI Flashcard Deck Generator** with hints |
| `POST` | `/ai/generate-quiz` | Authenticated | **AI MCQ Quiz Generator** with answers & explanations |
| `POST` | `/ai/generate-course-outline`| Authenticated | **AI Syllabus Planner** with modules & lesson breakdown |
| `POST` | `/ai/evaluate-assignment` | Authenticated | **AI Assignment Auto-Evaluator** with grades & feedback |

### 8. Quizzes & Assessments
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/quiz/:id` | Enrolled | Fetch sanitized quiz questions (hides `correctAnswer`) |
| `POST` | `/quiz` | `ADMIN`, `TEACHER` | Create quiz for a course |
| `POST` | `/quiz/:quizId/questions` | `ADMIN`, `TEACHER` | Add question with options & explanation |
| `POST` | `/quiz/:id/attempt` | Authenticated | Submit quiz attempt with automated grading |
| `GET` | `/quiz/:quizId/my-attempts` | Authenticated | View student's past attempt scores |
| `GET` | `/quiz/:quizId/submissions` | `ADMIN`, `TEACHER` | Instructor view all student submissions |

### 9. Assignments & Submissions
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/assignment/course/:courseId`| Enrolled | List course assignments |
| `POST` | `/assignment` | `ADMIN`, `TEACHER` | Create assignment with due date |
| `POST` | `/assignment/:id/submit` | Authenticated | Submit file/text (validates deadline) |
| `GET` | `/assignment/my-submissions` | Authenticated | Student's submitted assignments |
| `GET` | `/assignment/:id/submissions`| `ADMIN`, `TEACHER` | Instructor view all assignment submissions |
| `PATCH` | `/assignment/submission/:id/grade` | `ADMIN`, `TEACHER` | Grade submission & provide feedback |

### 10. Live Classes & Real-Time Attendance
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/live-class/:courseId` | Enrolled | List scheduled & past live classes |
| `POST` | `/live-class` | `ADMIN`, `TEACHER` | Schedule live class (Zoom/Meet link) |
| `POST` | `/attendance/check-in` | Authenticated | Student check-in to live class |
| `PATCH` | `/attendance/ping/:id` | Authenticated | Heartbeat ping to track active watch-time |
| `PATCH` | `/attendance/check-out/:id` | Authenticated | Student check-out from live class |
| `GET` | `/attendance/class/:liveClassId` | `ADMIN`, `TEACHER` | Class attendance list & total minutes |

### 11. Orders, Coupons & SSLCommerz Payments
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/orders` | Authenticated | Create course purchase order with coupon calculation |
| `GET` | `/orders/my-orders` | Authenticated | Student's purchase order history |
| `GET` | `/orders/all` | `ADMIN` | Admin view all orders |
| `GET` | `/coupon/validate/:code/:courseId` | Public | Validate promo discount code |
| `POST` | `/payments/initiate` | Authenticated | Initialize SSLCommerz checkout session |
| `POST` | `/payments/success/:orderId`| Public | SSLCommerz IPN success callback (auto-enrolls & invoices) |
| `POST` | `/payments/fail/:orderId` | Public | SSLCommerz payment failure callback |
| `POST` | `/payments/cancel/:orderId` | Public | SSLCommerz payment cancel callback |

### 12. Invoices & Receipts
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/invoice/my-invoices` | Authenticated | List all PDF invoices for logged-in user |
| `GET` | `/invoice/:id` | Authenticated | Invoice details & Cloudinary PDF download link |

### 13. Certificates & Public QR Verification
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/certificate/my` | Authenticated | Fetch earned certificates for current user |
| `GET` | `/certificate/verify/:code` | **Public** | Instant credential verification by QR code |

### 14. Community Discussions & Reviews
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/discussion/course/:courseId` | Enrolled | Fetch forum discussion threads |
| `POST` | `/discussion` | Authenticated | Create discussion thread |
| `POST` | `/discussion/:id/reply` | Authenticated | Post reply to discussion thread |
| `POST` | `/review` | Authenticated | **Submit review (Enrolled Student Guard protected)** |
| `GET` | `/review/:courseId` | Public | List approved course reviews |
| `PATCH` | `/review/:id/status` | `ADMIN` | Approve/reject review (**Auto-recalculates course rating**) |

### 15. Announcements & Notifications
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/announcement/:courseId` | Enrolled | Course announcements feed |
| `POST` | `/announcement` | `ADMIN`, `TEACHER` | Publish announcement targeted by role |
| `GET` | `/notification` | Authenticated | User's notifications feed |
| `PATCH` | `/notification/read-all` | Authenticated | **Mark all notifications as read in bulk** |
| `PATCH` | `/notification/:id/read` | Authenticated | Mark single notification as read |

### 16. Admin & Instructor Analytics
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/analytics/admin` | `ADMIN` | Total students, courses, enrollments, certificates, revenue, top courses & recent orders |
| `GET` | `/analytics/instructor` | `TEACHER` | Instructor course sales, student count & earnings |

### 17. Activity Audit Logs & White-Label Settings
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/admin/activity-logs` | `ADMIN` | Audit log trail (IP, actions, user-agent) |
| `GET` | `/settings` | Public | Fetch site branding, colors & active theme |
| `PATCH` | `/settings` | `ADMIN` | Update theme colors, logo, favicon & maintenance |

---

## 🔒 Security & Best Practices

- **Password Hashing:** Passwords encrypted using **Bcrypt** with salt rounds.
- **Route Protection:** Guards enforce valid JWT signatures and role permissions (`RolesGuard`).
- **Rate Limiting:** IP-based throttling via `@nestjs/throttler` (120 req/min).
- **CORS Protection:** Cross-Origin Resource Sharing enabled for secure multi-client communication.
- **Input Validation:** Incoming DTO payloads sanitized using `class-validator` and `ValidationPipe`.
- **Enrollment Guards:** Lesson viewing and course reviews strictly protected by active enrollment checks.
- **Audit Logging:** Every administrative action is automatically logged via `ActivityLogInterceptor`.
- **Environment Isolation:** Secrets and keys are strictly segregated via `.env` and kept out of version control.
- **Production Proxy:** Nginx handles HTTP headers, caching, and proxies traffic to the internal Node process.

---

## 🤝 Contributing & License

Contributions, issues, and feature requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Distributed under the **MIT License**.
