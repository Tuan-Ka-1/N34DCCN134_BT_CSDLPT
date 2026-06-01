# The Analysis: Distributed Inheritance & Schema Evolution

**Project:** 89. Distributed Inheritance Handling: "Vehicle Fleet"
**Theory Reference:** Principles of Distributed Database Systems by M. Tamer Özsu and Patrick Valduriez.

## 1. Object Identity (OID) Management
In distributed object management, maintaining a consistent Object Identity (OID) across sites is crucial (Özsu & Valduriez, Chapter 15). Unlike purely relational fragmentation where primary keys can be localized, distributed inheritance requires the OID to act as a universal pointer. 
In our "Vehicle Fleet" system, we utilize **UUIDv4** generated at the Coordinator (Site 0) during object creation. This UUID serves as the primary key (`id`) in the base `Vehicle` table and acts as the foreign key (`vehicle_id`) in the specialized tables (`Truck` at Site 1, `ElectricCar` at Site 2). This guarantees **Location Transparency** and **Fragmentation Transparency**; the application can request an object by its OID, and the coordinator handles the "Object Rehydration" by gathering fragments without the client needing to know where the data physically resides.

## 2. Complexity Handling: Polymorphic Search
Retrieving a complete object in a distributed inheritance model requires reconstructing the object from its base class and subclass fragments.
Our system implements a "Polymorphic Search" where the Coordinator first fetches all base instances, then concurrently fetches all subclass fragments from Site 1 and Site 2. To optimize the "Cost of Object Rehydration", we implemented an **In-Memory Hash Join** ($O(N)$ complexity instead of $O(N \times M)$). By fetching subclass fragments in parallel via asynchronous network calls (`Promise.all`), we minimize the overall response time, successfully trading off some network bandwidth for high parallelism and low latency.

## 3. The Schema Evolution Problem
Schema evolution in distributed databases is a complex challenge because altering a class definition (e.g., adding an attribute to `Vehicle`) requires propagating that change to all distributed subclasses to maintain schema consistency.

According to Özsu and Valduriez, there are generally two approaches to schema updates:
- **Eager Update (Synchronous):** The schema change is immediately broadcasted to all nodes. The system blocks until all nodes acknowledge the structural change.
- **Lazy Update (Asynchronous/Versioning):** Objects are allowed to exist in multiple schema versions, and the system handles the discrepancy during read operations (often using a schema version ID).

**Our Implementation:**
We implemented the **Eager Update** mechanism. When the `/api/evolve-schema` endpoint is triggered, the Coordinator modifies its local schema (adding the `color` attribute) using raw SQL (`ALTER TABLE`). It then immediately dispatches requests to Site 1 and Site 2 to execute their respective schema alterations. This guarantees **Strict Consistency** across the cluster. If a new attribute is added to the superclass, all worker nodes are instantly aware and structurally ready to store the inherited attribute.

## 4. Fault Tolerance & Network Awareness
Distributed queries are susceptible to partial failures. If Site 1 crashes, an eager join would cause the entire global query to fail. We mitigate this using a fail-soft approach. If a worker node times out or refuses connection, the Coordinator catches the exception and returns the base object with a specialized flag `status: "Data unavailable"`. This ensures the system maintains high Availability for the healthy partitions (e.g., Electric Cars) even when the Truck partition is down. Furthermore, the system measures and exposes the exact `network_fetch_ms` vs `db_fetch_ms` to provide full observability into the cost of cross-site object rehydration.
