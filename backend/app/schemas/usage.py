from pydantic import BaseModel


class UsageBucket(BaseModel):
    used: int
    limit: int

    def __getitem__(self, key):
        return getattr(self, key)


class UsageSummaryResponse(BaseModel):
    plan: str
    today: dict[str, UsageBucket]
    this_month: dict[str, UsageBucket]
