import uuid, random
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from db.connection import engine

random.seed(42)
np.random.seed(42)

N_CUSTOMERS = 5000
END_DATE = datetime.now()
START_DATE = END_DATE - timedelta(days=730)

print("Seeding customers...")
customers = pd.DataFrame(
    {
        "customer_id": [str(uuid.uuid4()) for _ in range(N_CUSTOMERS)],
        "external_id": [f"CUST-{i:05d}" for i in range(N_CUSTOMERS)],
        "signup_date": [
            START_DATE + timedelta(days=random.randint(0, 600))
            for _ in range(N_CUSTOMERS)
        ],
        "country": np.random.choice(
            ["US", "UK", "CA", "AU", "DE"], N_CUSTOMERS, p=[0.5, 0.2, 0.15, 0.1, 0.05]
        ),
        "plan_type": np.random.choice(
            ["free", "starter", "pro", "enterprise"],
            N_CUSTOMERS,
            p=[0.3, 0.4, 0.2, 0.1],
        ),
    }
)
customers.to_sql("customers", engine, if_exists="append", index=False)

print("Seeding transactions...")
txn_rows = []
for _, cust in customers.iterrows():
    # Champions buy a lot; Lost customers barely buy
    n_txns = int(np.random.exponential(15) + 1)
    start = cust["signup_date"]
    # 30% are "churned" customers with no activity in last 90 days
    is_churned = random.random() < 0.3
    max_date = END_DATE - timedelta(days=95) if is_churned else END_DATE
    for _ in range(n_txns):
        txn_date = start + timedelta(days=random.randint(0, (max_date - start).days))
        txn_rows.append(
            {
                "customer_id": cust["customer_id"],
                "transaction_date": txn_date,
                "amount": round(random.lognormvariate(4, 1), 2),
                "product_category": random.choice(
                    ["SaaS", "Add-on", "Support", "License"]
                ),
                "channel": random.choice(["web", "mobile", "direct"]),
            }
        )

pd.DataFrame(txn_rows).to_sql(
    "transactions", engine, if_exists="append", index=False, chunksize=1000
)
print(f"Seeded {len(txn_rows)} transactions. Done!")
