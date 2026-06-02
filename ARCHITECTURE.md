# Vrancart CRM & B2B Portal Architecture

## Overview
A unified platform serving both internal Vrancart staff (CRM) and external customers (B2B Portal). The system models paper production and cardboard conversion processes, integrating deeply with Dynamics 365 Business Central.

## Core Components

### 1. Frontend: Single Page Application (React)
- **Tech Stack:** React, TypeScript, Vanilla CSS.
- **Routing & RBAC:** Single application mapping internal and external user experiences based on role.
- **Visual Configurator:** React Three Fiber (Three.js) for 3D box models, providing interactive visual feedback when specifying cardboard parameters (dimensions, flutes, prints).
- **State Management:** React Context / Zustand for managing complex pricing configurations.

### 2. Backend: Go Microservices
- **API Gateway:** Central entry point routing to specific microservices (or a unified monolithic structure designed to split into microservices).
- **Auth Service:**
  - Handles Entra ID (OAuth2) token validation for internal staff.
  - Manages custom JWT-based authentication against the PostgreSQL database for B2B portal external users.
- **CRM Service:**
  - Manages customer relationships, activities, interactions.
  - Syncs core customer data to/from D365.
- **Product & Pricing Service (Configurator Engine):**
  - Calculates box/cardboard costs based on detailed physical parameters (paper grade, dimensions, die-cutting, gluing, stapling).
  - Handles discount logic for sales staff.
- **ERP Integration Service (D365 Bridge):**
  - Communicates with Dynamics 365 Business Central via Entra ID OAuth2.
  - Syncs master data (items, orders, customers).

### 3. Databases
- **PostgreSQL:**
  - `crm_db`: Interactions, pipeline, external user accounts.
  - `products_db`: Configurations, local pricing rules, custom specs not yet in D365.

### 4. Infrastructure (Staging)
- **Target OS:** Ubuntu 22.04 LTS (172.16.75.68).
- **Deployment:** Go binaries via systemd and compiled React frontend served via Nginx/Caddy, or Docker Compose orchestrating the services.
