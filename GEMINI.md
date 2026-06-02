# VNC-CRM

A full sales CRM for the cardboard industry, focused on customer interactions, product prototyping, and managing the production of tissue, paper grades (testliner, schrenz, wellenstoff), and cardboard products (sheets, boxes).

## Tech Stack & Architecture

- **Backend:** Go (Microservices architecture)
- **Database:** PostgreSQL (for both CRM local state and external data storage)
- **Frontend:** React (TypeScript) with Vanilla CSS
- **Visual Configurator:** 3D Interactive interface (using Three.js/React Three Fiber) for cardboard sheets and boxes
- **Authentication & Users:**
  - **Internal Users:** Entra ID (OAuth2)
  - **External Users (B2B):** Custom managed in a dedicated application page (custom DB auth)
- **ERP Integration:** Dynamics 365 Business Central via OAuth2 Entra ID
- **Infrastructure:** Remote Ubuntu 22.04 LTS server (172.16.75.68)

## Project Goals

- Manage customer interactions.
- Prototype new products, offerings, solutions, and structures.
- Support production workflows for:
    - Tissue from recycled paper.
    - Paper grades: Testliner, Schrenz, Wellenstoff.
    - Cardboard sheets and boxes (printing, die-cutting, folding, gluing, stapling).

## Conventions & Workflow

- **Remote Management:** You will be provided with remote server access. You are expected to copy, upload, and perform all changes directly on these servers or as instructed.
- **Code Style:** Follow standard Go and React/TypeScript conventions unless otherwise specified.
- **Deployment:** [To be defined - clarify with user when ready]
- **Internationalization (i18n):** Always develop interface features in both **English (Primary)** and **Romanian (Secondary)**. All UI strings, labels, tooltips, placeholders, and feedback messages must be declared in [i18n.ts](file:///C:/Users/aurelian/Downloads/VNC-CRM/frontend/src/i18n.ts) and retrieved dynamically using the translation hook.

## Production Capabilities to Model

- **Paper Production:** Recycled paper to tissue/paper grades.
- **Cardboard Conversion:** Printing, die-cutting, folding, gluing, stapling.
- **Product Types:** Cardboard sheets, boxes, tissue.
