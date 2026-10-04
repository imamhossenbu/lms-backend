# 🎓 LMS AI Backend — Next-Gen Learning Management & AI Platform

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Nginx](https://img.shields.io/badge/Nginx-Reverse%20Proxy-009639?style=flat&logo=nginx&logoColor=white)](https://nginx.org/)
[![Resend](https://img.shields.io/badge/Email-Resend-black?style=flat&logo=resend&logoColor=white)](https://resend.com/)
[![SSLCommerz](https://img.shields.io/badge/Payment-SSLCommerz-006A4E?style=flat)](https://sslcommerz.com/)

A comprehensive, scalable, enterprise-grade backend for modern **Learning Management Systems (LMS)** enhanced with **Artificial Intelligence (AI)** capabilities. Built with **NestJS**, **TypeScript**, **Prisma ORM**, and **PostgreSQL**, this platform provides course lifecycle management, live virtual classes, video progress tracking, AI tutoring, automated dynamic PDF certificates with QR verification, payment gateway integration, and multi-tenant theme customization.

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
- [Docker & Containerized Deployment](#-docker--containerized-deployment)
- [API Reference & Endpoints](#-api-reference--endpoints)
  - [Authentication & Security](#1-authentication--security)
  - [Users & Profiles](#2-users--profiles)
  - [Categories & Courses](#3-categories--courses)
  - [Curriculum (Modules & Lessons)](#4-curriculum-modules--lessons)
  - [Lesson Progress & Video Tracking](#5-lesson-progress--video-tracking)
  - [Quizzes & Questions](#6-quizzes--questions)
  - [Assignments & Submissions](#7-assignments--submissions)
  - [Live Classes & Attendance](#8-live-classes--attendance)
  - [Orders, Coupons & Payments](#9-orders-coupons--payments)
  - [Invoices & Receipts](#10-invoices--receipts)
  - [Certificates & Public Verification](#11-certificates--public-verification)
  - [Community, Discussions & Reviews](#12-community-discussions--reviews)
  - [Announcements & Notifications](#13-announcements--notifications)
  - [AI Engine & Settings](#14-ai-engine--settings)
  - [Activity Logs & White-Label Settings](#15-activity-logs--white-label-settings)
- [Security & Best Practices](#-security--best-practices)
- [Contributing & License](#-contributing--license)

---

## 🌟 Key Features

### 🔐 1. Authentication & Role-Based Access Control (RBAC)
- **Multi-Role System:** Granular access controls for `STUDENT`, `TEACHER` / `INSTRUCTOR`, and `ADMIN`.
- **JWT Authentication:** Secure access token generation, validation, and passport strategy guards.
- **Account Verification:** Email verification workflows powered by Resend transactional email API.
- **Security Lifecycle:** Password resets with time-expiring tokens, security alert emails for suspicious changes, and self-service profile controls.

### 📚 2. Course & Curriculum Architecture
- **Hierarchical Course Structure:** Categories $\rightarrow$ Courses $\rightarrow$ Course Modules $\rightarrow$ Lessons $\rightarrow$ Downloadable Resources.
- **Rich Media & Assets:** Cloudinary integration for course thumbnails, avatars, and downloadable attachments.
- **Preview & Access Locks:** Free preview lesson support, conditional module locking, and access restriction for enrolled learners.
- **Granular Lesson Tracking:** Resume video playback position (`lastPosition`), logged watched minutes, and automatic completion states.

### 🤖 3. Artificial Intelligence Engine
- **AI Settings Management:** Admin configurable AI provider settings (Groq, OpenAI models, custom temperatures, token limits, and system prompts).
- **AI Tutor Session Models:** Architecture for interactive conversational AI tutoring tied to specific courses and lessons.
- **AI-Powered Assessments:** AI automated grading, submission feedback, and smart learning recommendations.

### 📝 4. Assessments, Quizzes & Assignments
- **Comprehensive Quizzes:** Timed quizzes, pass mark benchmarks, randomized questions, multiple choice options, and detailed answer explanations.
- **Assignment Submissions:** Student file uploads or text answers, instructor marking, and automated AI evaluation feedback.

### 🎥 5. Live Classes & Real-Time Attendance
- **Live Virtual Classrooms:** Live session scheduling, meeting URLs (Zoom / Google Meet), and recorded lecture archives.
- **Automated Attendance:** Precise join/leave tracking with calculated minutes attended and attendance status reporting.

### 💳 6. Payments, Checkout & Dynamic Invoicing
- **SSLCommerz Integration:** Hosted payment checkout with automated validation, success, failure, and cancellation handling.
- **Promotions & Coupons:** Percentage and fixed discount codes with expiration dates, maximum usage caps, and per-course restrictions.
- **Dynamic PDF Invoices:** Auto-generated PDF receipts using **PDFKit** and **bwip-js** barcodes/QRs with breakdown of discounts, tax, and order totals.

### 🏆 7. QR-Verified Dynamic Certificates
- **Automated Issuance:** Triggered upon 100% course completion and curriculum milestones.
- **Dynamic Vector Certificates:** Rendered with **PDFKit**, complete with custom typography, certificate ID, and dynamic verification QR code.
- **Instant Public Verification:** Dedicated public API (`/certificate/verify/:code`) enabling third-party verification of credentials.
- **Email Delivery:** Instant delivery of issued certificates directly to the student's inbox via Resend.

### 💬 8. Community, Forum & Feedback
- **Discussion Forums:** Course-specific discussion threads with nested replies and resolved status flags.
- **Course Ratings & Reviews:** Verified reviews, 1-5 star ratings, and automatic recalculation of course average ratings.

### 🛡️ 9. System Auditing & White-Label Customization
- **Global Activity Logs:** NestJS interceptor logging all administrative mutations, user IDs, IP addresses, and user-agent details.
- **Full Platform Theming:** Dynamic customization of platform brand name, logos, favicons, primary/accent color schemes, typography, and maintenance mode toggles.

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client[Web & Mobile Clients] -->|HTTP / REST| Nginx[Nginx Reverse Proxy :80]
    Nginx -->|Proxy Pass :4000| NestApp[NestJS Application Server]
    
    subgraph NestJS Core Services
        Auth[Auth & JWT Guard]
        RBAC[Roles Guard: Admin / Teacher / Student]
        Logger[Activity Log Interceptor]
        Controllers[API Controllers]
    end
    
    NestApp --> Auth
    Auth --> RBAC
    RBAC --> Logger
    Logger --> Controllers
    
    subgraph External & Database Integrations
        Controllers -->|Prisma 7 Adapter| DB[(PostgreSQL Database)]
        Controllers -->|Transactional Mail| Resend[Resend API]
        Controllers -->|Media CDN| Cloudinary[Cloudinary Cloud]
        Controllers -->|Payment Gateway| SSLCommerz[SSLCommerz Gateway]
        Controllers -->|LLM Inference| Groq[Groq / AI Engine]
        Controllers -->|PDF Generation| PDFKit[PDFKit Engine & QR/Barcodes]
    end
```

---

## 💻 Technology Stack

| Layer | Technologies |
|---|---|
| **Runtime & Framework** | [Node.js](https://nodejs.org/) (v20+), [NestJS](https://nestjs.com/) v11.x, Express |
| **Language** | [TypeScript](https://www.typescriptlang.org/) v6.x |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/) (Compatible with Neon, Supabase, RDS), [Prisma](https://www.prisma.io/) v7.x |
| **Authentication** | [Passport.js](http://www.passportjs.org/), JWT (`@nestjs/jwt`), Bcrypt |
| **Email Delivery** | [Resend](https://resend.com/) HTTP API & [Nodemailer](https://nodemailer.com/) |
| **Asset Storage** | [Cloudinary](https://cloudinary.com/) (Multer upload pipeline) |
| **Payment Gateway** | [SSLCommerz](https://sslcommerz.com/) |
| **Document & QR Generation** | [PDFKit](https://pdfkit.org/), `qrcode`, `bwip-js` (Barcodes) |
| **AI Inference** | [Groq](https://groq.com/) API / Axios |
| **Container & Proxy** | [Docker](https://www.docker.com/), [Docker Compose](https://docs.docker.com/compose/), [Nginx](https://nginx.org/) Alpine |

---

## 📁 Project Directory Structure

```text
lms-ai-backend/
├── prisma/
│   ├── schema.prisma            # Comprehensive Prisma database schema
│   └── migrations/              # Database migration history
├── src/
│   ├── activity-log/            # System-wide audit logging & interceptor
│   ├── ai/                      # AI configuration, prompts & LLM management
│   │   └── ai-settings/         # Dynamic model & system prompt settings
│   ├── announcement/            # Course & system announcement services
│   ├── assignment/              # Assignments & student submission reviews
│   ├── attendance/              # Live class attendance tracking
│   ├── auth/                    # Registration, JWT, guards, mail notifications
│   │   ├── decorators/          # @Roles() decorators
│   │   ├── guards/              # JWT & Role validation guards
│   │   └── mail/                # Resend HTML email templates
│   ├── category/                # Course categorization
│   ├── certificate/             # PDFKit certificate generator & QR verification
│   ├── cloudinary/              # Cloudinary media upload provider
│   ├── coupon/                  # Discount codes & promo engine
│   ├── course/                  # Core course CRUD & metadata
│   ├── course-module/           # Course curriculum module chapters
│   ├── discussion/              # Course forums, threads & replies
│   ├── enrollment/              # Course enrollment logic
│   ├── invoice/                 # Dynamic PDF invoice generation
│   ├── lession/                 # Lesson management (video/text/preview)
│   ├── lession-resource/        # Lesson downloadable assets
│   ├── lesson-progress/         # Video tracking, position & completion status
│   ├── live-class/              # Virtual classroom sessions
│   ├── notification/            # System notifications & templates
│   ├── order/                   # Checkout, order creation & pricing calculations
│   ├── payment/                 # SSLCommerz payment gateway integration
│   ├── prisma/                  # PrismaClient service & module
│   ├── quiz/                    # Quiz creation & scoring engine
│   ├── quiz-question/           # Quiz questions & answer validation
│   ├── review/                  # Student feedback & course star ratings
│   ├── settings/                # White-label site branding & themes
│   ├── user/                    # User profile, role & status management
│   ├── app.module.ts            # Root application module
│   └── main.ts                  # NestJS application bootstrap entrypoint
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

Configure the environment variables according to your services:

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | Application server port | `4000` |
| `BACKEND_URL` | Public backend base URL | `http://localhost:4000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname?sslmode=require` |
| `SUPER_SECRET_KEY` | Secret key for signing JWT tokens | `your-secure-random-jwt-secret-key` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | `your-api-key` |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | `your-api-secret` |
| `RESEND_API_KEY` | Resend API key for transactional emails | `re_123456789...` |
| `MAIL_FROM` | Sender address for outgoing emails | `LMS Platform <onboarding@resend.dev>` |
| `MAIL_HOST` | SMTP Host (optional fallback) | `smtp.resend.com` |
| `MAIL_PORT` | SMTP Port (optional fallback) | `587` |
| `MAIL_USER` | SMTP Username | `resend` |
| `MAIL_PASS` | SMTP Password | `re_123456789...` |
| `SSL_STORE_ID` | SSLCommerz Merchant Store ID | `your_store_id` |
| `SSL_STORE_PASSWORD` | SSLCommerz Merchant Store Password | `your_store_password` |
| `GROQ_API_KEY` | Groq LLM API Key for AI features | `gsk_...` |

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
   # Update .env with your PostgreSQL, Cloudinary, Resend, and SSLCommerz credentials
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

## 🐳 Docker & Containerized Deployment

This project includes a multi-stage Docker build and a ready-to-run `docker-compose.yml` with **Nginx** reverse proxy and health checks.

### Run with Docker Compose

```bash
# Build and run containers in detached mode
docker-compose up --build -d

# View real-time container logs
docker-compose logs -f app

# Stop all containers
docker-compose down
```

### Services Included
- **`app`**: The containerized NestJS application running on port `4000` with automated health checks.
- **`nginx`**: Alpine-based Nginx reverse proxy listening on port `80`, routing traffic to the backend application container.

---

## 📡 API Reference & Endpoints

All protected endpoints require an `Authorization` header with a valid Bearer token:
```http
Authorization: Bearer <your_jwt_token>
```

### 1. Authentication & Security
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register a new user account |
| `POST` | `/auth/login` | Public | Authenticate user & retrieve JWT token |
| `GET` | `/auth/verify?token=...` | Public | Verify student/teacher email address |
| `POST` | `/auth/forgot-password` | Public | Send password reset email link |
| `POST` | `/auth/reset-password` | Public | Reset password using verified token |
| `POST` | `/auth/change-password` | Authenticated | Change current user password |

### 2. Users & Profiles
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/user/me` | Authenticated | Retrieve authenticated user profile |
| `PATCH` | `/user/profile` | Authenticated | Update user bio, education, address & avatar |
| `GET` | `/user/all` | `ADMIN` | List all registered users |
| `PATCH` | `/user/admin/change-role` | `ADMIN` | Update user role (`STUDENT`, `TEACHER`, `ADMIN`) |
| `PATCH` | `/user/admin/change-status`| `ADMIN` | Toggle block/active status (`ACTIVE`, `BLOCKED`) |
| `DELETE` | `/user/admin/:id` | `ADMIN` | Remove a user account |

### 3. Categories & Courses
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/categories` | Public | Retrieve all course categories |
| `POST` | `/categories` | `ADMIN` | Create a new course category |
| `GET` | `/courses` | Public | Browse all published courses |
| `GET` | `/courses/:id` | Public | Retrieve full course details |
| `POST` | `/courses` | `ADMIN`, `TEACHER` | Create course with thumbnail image |
| `PATCH` | `/courses/:id` | `ADMIN`, `TEACHER` | Update course curriculum & details |
| `DELETE` | `/courses/:id` | `ADMIN`, `TEACHER` | Delete a course |

### 4. Curriculum (Modules & Lessons)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/courses/:courseId/modules` | Public / Enrolled | Fetch all modules for a course |
| `POST` | `/courses/:courseId/modules` | `ADMIN`, `TEACHER` | Create a curriculum module |
| `PATCH` | `/courses/:courseId/modules/:id` | `ADMIN`, `TEACHER` | Update module details/order |
| `DELETE` | `/courses/:courseId/modules/:id` | `ADMIN`, `TEACHER` | Delete module |
| `GET` | `/courses/:courseId/modules/:moduleId/lessons` | Enrolled | Fetch lessons under a module |
| `POST` | `/courses/:courseId/modules/:moduleId/lessons` | `ADMIN`, `TEACHER` | Add video/text lesson |
| `POST` | `/lessons/:lessonId/resources` | `ADMIN`, `TEACHER` | Upload downloadable lesson resources |
| `GET` | `/lessons/:lessonId/resources` | Enrolled | Download lesson resources |

### 5. Lesson Progress & Video Tracking
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `PATCH` | `/progress/:lessonId/video` | Authenticated | Sync video watched minutes & position |
| `PATCH` | `/progress/:lessonId/complete` | Authenticated | Mark lesson as completed |

### 6. Quizzes & Questions
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/quiz/:id` | Enrolled | Retrieve quiz details and questions |
| `POST` | `/quiz` | `ADMIN`, `TEACHER` | Create quiz for a course/lesson |
| `POST` | `/quiz/:quizId/questions` | `ADMIN`, `TEACHER` | Add multiple-choice question to quiz |
| `POST` | `/quiz/:id/attempt` | Authenticated | Submit quiz answers and calculate score |

### 7. Assignments & Submissions
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/assignment/course/:courseId`| Enrolled | List assignments for a course |
| `POST` | `/assignment` | `ADMIN`, `TEACHER` | Create course assignment with due date |
| `POST` | `/assignment/:id/submit` | Authenticated | Submit assignment file or text answer |
| `PATCH` | `/assignment/submission/:id/grade` | `ADMIN`, `TEACHER` | Grade submission & provide feedback |

### 8. Live Classes & Attendance
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/live-class/course/:courseId` | Enrolled | List scheduled & past live classes |
| `POST` | `/live-class` | `ADMIN`, `TEACHER` | Schedule live class (Zoom/Meet link) |
| `POST` | `/attendance/join` | Authenticated | Record student join time |
| `POST` | `/attendance/leave` | Authenticated | Record student leave time & duration |

### 9. Orders, Coupons & Payments
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/orders` | Authenticated | Create a course purchase order |
| `POST` | `/coupon/apply` | Authenticated | Validate and apply promo discount code |
| `POST` | `/payments/initiate` | Authenticated | Initialize SSLCommerz payment session |
| `POST` | `/payments/success/:orderId` | Public | SSLCommerz IPN success callback |
| `POST` | `/payments/fail` | Public | SSLCommerz payment failure callback |
| `POST` | `/payments/cancel` | Public | SSLCommerz payment cancel callback |

### 10. Invoices & Receipts
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/invoice/my-invoices` | Authenticated | List all invoices for logged-in user |
| `GET` | `/invoice/:id` | Authenticated | Retrieve invoice details & PDF download link |

### 11. Certificates & Public Verification
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/certificate/my` | Authenticated | Fetch earned certificates for current user |
| `GET` | `/certificate/verify/:code` | **Public** | Instant credential verification by QR code |
| `GET` | `/certificate/test-gen/:userId/:courseId` | `ADMIN` | Test certificate generation & email dispatch |

### 12. Community, Discussions & Reviews
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/discussion/course/:courseId` | Public / Enrolled | Fetch forum discussion threads |
| `POST` | `/discussion` | Authenticated | Create discussion thread |
| `POST` | `/discussion/:id/reply` | Authenticated | Post reply to discussion thread |
| `POST` | `/review` | Authenticated | Submit 1-5 star course rating and review |
| `GET` | `/review/course/:courseId` | Public | List course reviews & rating distribution |

### 13. Announcements & Notifications
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/announcement/course/:courseId` | Enrolled | Retrieve course announcements |
| `POST` | `/announcement` | `ADMIN`, `TEACHER` | Publish announcement targeted by role |
| `GET` | `/notification/my` | Authenticated | Get user's notifications feed |
| `PATCH` | `/notification/:id/read` | Authenticated | Mark notification as read |

### 14. AI Engine & Settings
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/ai-settings` | Authenticated | Fetch active AI configuration and models |
| `POST` | `/ai-settings` | `ADMIN` | Save AI feature configurations |
| `PATCH` | `/ai-settings/:featureKey` | `ADMIN` | Update system prompt, temperature & tokens |

### 15. Activity Logs & White-Label Settings
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/admin/activity-logs` | `ADMIN` | Audit log trail (IP, actions, user-agent) |
| `GET` | `/settings` | Public | Fetch site branding, colors & active theme |
| `POST` | `/settings` | `ADMIN` | Initialize brand settings |
| `PATCH` | `/settings` | `ADMIN` | Update theme colors, logo, favicon & maintenance |

---

## 🔒 Security & Best Practices

- **Password Hashing:** Passwords encrypted using **Bcrypt** with salt rounds.
- **Route Protection:** Guards enforce valid JWT signatures and role permissions (`RolesGuard`).
- **Input Validation:** Incoming DTO payloads sanitized using `class-validator` and `ValidationPipe`.
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

Distributed under the **MIT License**. See `LICENSE` for more information.
