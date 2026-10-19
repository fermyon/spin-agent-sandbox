from pydantic import BaseModel, Field, ValidationError, field_validator


class User(BaseModel):
    name: str
    age: int = Field(ge=0)

    @field_validator("name")
    @classmethod
    def name_is_capitalized(cls, value: str) -> str:
        if not value[:1].isupper():
            raise ValueError("name must be capitalized")
        return value


user = User(name="Ada", age="36")
print(user.model_dump_json())
assert user.age == 36

try:
    User(name="ada", age=-1)
except ValidationError as e:
    print(f"rejected with {e.error_count()} errors")
    assert e.error_count() == 2
else:
    raise AssertionError("invalid user was accepted")
