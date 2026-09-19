# Schema Weaver Connector Security Architecture

## LCB + CERO Architecture

Schema Weaver's database connector is built around two core architectural principles:

### Local Credential Boundary (LCB)

**Local Credential Boundary (LCB)** is Schema Weaver's connector architecture that isolates customer database credentials inside the customer's environment while allowing cloud-based orchestration and AI-assisted analytics through a controlled connector data plane.

### Connector-Enforced Read-Only Execution (CERO)

**Connector-Enforced Read-Only Execution (CERO)** is Schema Weaver's connector security architecture that enforces read-only database access at the connector execution boundary, independently of the cloud application or AI model requesting the operation.

Together, LCB and CERO establish a separation between **credential ownership, database execution authority, cloud orchestration, and AI-powered analysis.**

---

# 1. Local Credential Boundary (LCB)

## Customer-Owned Credential Boundary

The Schema Weaver connector is designed around a **Local Credential Boundary**: sensitive database credentials remain inside the customer's environment and are not required to enter Schema Weaver's cloud application layer.

The connector establishes and maintains the database connection locally using credentials controlled by the customer.

The following information remains within the customer's environment:

* Database host
* Database port
* Database username
* Database password
* Database connection strings
* SSL certificates and private keys
* Other database authentication material

Schema Weaver Cloud instead operates using connector identity and scoped communication credentials.

A database name or alias may be exposed as operational metadata, but the underlying database authentication material remains local to the connector.

### Architectural Principle

> **Credentials stay with the customer.**

The cloud control plane does not need possession of the customer's database credentials in order to orchestrate connector operations.

This creates a deliberate security boundary between **cloud orchestration** and **database authentication**.

---

# 2. Connector-Enforced Read-Only Execution (CERO)

## The Connector as the Execution Security Boundary

Schema Weaver's connector is not simply a communication bridge between a web application and PostgreSQL.

It is the **database execution boundary**.

The logical execution model is:

**Cloud / AI → Connector → CERO Policy Enforcement → Customer Database**

Every database operation must pass through the connector before reaching the customer's database.

CERO ensures that the connector independently enforces the permitted operation model.

For Data Explorer workloads, the connector provides **read-only database execution**, preventing unsupported or destructive operations from being forwarded to the customer's database.

This means that database access authority does not originate exclusively from the cloud application or the AI model.

The connector remains the final enforcement point.

### Architectural Principle

> **Execution stays behind the connector.**

An AI model may generate a SQL operation, but the model does not receive unrestricted authority over the customer's database.

The connector evaluates the requested operation before it reaches the database.

---

# 3. Separation of Credential Ownership and Execution Authority

LCB and CERO create two independent security boundaries.

### LCB controls:

**Who possesses the credentials?**

The customer's environment and connector.

### CERO controls:

**What can actually be executed?**

The connector's local execution policy.

This creates the following security model:

```text
                 SCHEMA WEAVER CLOUD
              ┌───────────────────────┐
              │ Orchestration          │
              │ AI requests            │
              │ Connector communication│
              │ Telemetry               │
              └───────────┬───────────┘
                          │
                          │ Controlled request
                          ▼
             ┌────────────────────────────┐
             │ Schema Weaver Connector     │
             │                            │
             │ LCB                        │
             │ Credentials remain local   │
             │                            │
             │ CERO                       │
             │ Read-only enforcement      │
             └────────────┬───────────────┘
                          │
                          │ Permitted operation
                          ▼
                  CUSTOMER DATABASE
```

The cloud can request an operation, but it does not inherently possess the customer's database credentials or unrestricted database execution authority.

---

# 4. Controlled Connector Data Plane

The Schema Weaver connector creates a controlled data plane between the customer's database and Schema Weaver's cloud services.

The connector handles:

* Local database authentication
* Database connectivity
* SQL execution
* Execution-policy enforcement
* Query-result transmission
* Connector health
* Operational telemetry

The cloud layer handles:

* Connector orchestration
* Connector identity
* User-facing application functionality
* Query request routing
* Operational telemetry
* AI-assisted analytical workflows

This separation allows Schema Weaver to provide cloud-based database exploration without requiring the cloud application to become the customer's database credential repository.

---

# 5. Transient Query-Result Handling

Query-result data can traverse the Schema Weaver cloud communication layer when required to return results to the user's application or perform an explicitly requested AI analysis.

The architectural distinction is important:

**Database credentials → local**

**Database execution → connector**

**Query results → transient data plane**

**Operational telemetry → persistent application data where required**

The connector does not require Schema Weaver to maintain a persistent copy of the customer's database.

Query-result rows are therefore treated as **data-plane information required for the active operation**, rather than as persistent application records.

---

# 6. AI-Assisted Analytics Boundary

AI-powered database analytics necessarily requires the AI system to receive the information required to perform the requested analysis.

For example, if a user asks an AI system to:

* identify anomalies,
* analyze trends,
* compare records,
* detect outliers,
* explain query results,
* summarize a dataset,

the relevant query-result information must be available to the model.

Schema Weaver therefore separates the AI analysis boundary from the credential boundary.

### LCB

Protects the customer's database authentication material.

### CERO

Protects the customer's database execution authority.

### AI Analysis

Receives the data required for the explicitly requested analytical task.

This allows Schema Weaver to provide AI-assisted database analytics without making the AI model itself the holder of database credentials or unrestricted database access.

---

# 7. Telemetry Without Database Replication

Schema Weaver may retain operational telemetry required for product functionality, observability, auditing, and user-facing activity history.

Examples include:

* SQL statement fingerprints
* Redacted SQL statement previews
* Execution duration
* Rows returned
* Rows affected
* Operation type
* Connector health events
* Connection events
* Error information

This operational telemetry is separate from the underlying database contents.

Schema Weaver does not need to persist query-result rows merely to provide query history, connector health, or operational observability.

The architecture therefore separates:

**Operational history**

from

**Customer database contents.**

---

# 8. Security Architecture Principles

The Schema Weaver connector follows three primary principles:

### 1. Credentials Stay Local

Through **Local Credential Boundary (LCB)**, database authentication material remains within the customer's environment.

### 2. Execution Stays Behind the Connector

Through **Connector-Enforced Read-Only Execution (CERO)**, database operations are subject to local connector enforcement before reaching the customer's database.

### 3. Data Moves Only When Required

Query-result data is transmitted when required by the active product workflow, such as returning query results or performing requested AI analysis, rather than being maintained as a persistent copy of the customer's database.

---

# 9. The Schema Weaver Connector Model

The combined architecture can be summarized as:

> **Local Credential Boundary (LCB)** protects the customer's database credentials.

> **Connector-Enforced Read-Only Execution (CERO)** protects the customer's database from unauthorized or destructive execution.

> **Controlled Connector Data Plane** enables cloud orchestration and AI-assisted analytics without requiring the cloud control plane to possess the customer's database credentials.

Together:

### **Credentials stay with the customer.**

**Execution stays behind the connector.**  
**Data moves only when the workload requires it.**

---

# 10. Architectural Positioning

Schema Weaver's connector is therefore designed not as a conventional cloud database credential proxy, but as a **customer-side execution and security boundary**.

The architecture separates four distinct responsibilities:

| Responsibility               | Boundary                   |
| ---------------------------- | -------------------------- |
| Database credentials         | Customer environment / LCB |
| Database execution authority | Connector / CERO           |
| Cloud orchestration          | Schema Weaver Cloud        |
| Analytical intelligence      | Configured AI model        |

This separation minimizes the amount of trust placed in any individual layer.

A cloud service can orchestrate an operation without possessing the underlying database credentials.

An AI model can analyze database information without receiving unrestricted database authority.

The connector remains the local enforcement point between external requests and the customer's database.

---

# 11. Short Definition for Product and Security Documentation

**Local Credential Boundary (LCB)** is Schema Weaver's connector architecture that isolates customer database credentials inside the customer's environment while allowing cloud-based orchestration and AI-assisted analytics through a controlled connector data plane.

**Connector-Enforced Read-Only Execution (CERO)** is Schema Weaver's connector security architecture that enforces read-only database access at the connector execution boundary, independently of the cloud application or AI model requesting the operation.

Together, LCB and CERO provide a connector architecture in which **credentials remain local, database execution is locally enforced, and cloud-based services receive only the data required by the active workflow.**
