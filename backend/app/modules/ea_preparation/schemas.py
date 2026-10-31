from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.core.api_model import APIModel


class Message(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: Literal['user', 'assistant']
    text: str = Field(min_length=1, max_length=8000)

    @field_validator('text')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Message must not be blank.')
        return value.strip()


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    message: str = Field(min_length=1, max_length=8000)
    history: list[Message] = Field(default_factory=list, max_length=20)
    search_web: bool = Field(default=False, alias='searchWeb', strict=True)


    @model_validator(mode='after')
    def bounded(self):
        self.message = self.message.strip()
        if not self.message or sum(len(m.text) for m in self.history) + len(self.message) > 12000:
            raise ValueError('Conversation is empty or too large; start a new conversation.')
        return self


class Question(BaseModel):
    model_config = ConfigDict(extra='forbid')
    question: str = Field(min_length=1, max_length=2000)
    reason: str = Field(min_length=1, max_length=1000)
    priority: Literal['Essential', 'Follow-up']

    @field_validator('question', 'reason')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Question fields must not be blank.')
        return value.strip()


class QuestionsReply(BaseModel):
    model_config = ConfigDict(extra='forbid')
    questions: list[Question] = Field(min_length=1, max_length=10)


class WebSource(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=300)
    url: str = Field(max_length=2048)

    @field_validator('url')
    @classmethod
    def public_url(cls, value):
        from app.agents.tools.public_web import safe_public_url
        if not safe_public_url(value):
            raise ValueError('Source must be a public HTTPS URL.')
        return value


class ChatReply(APIModel):
    out_of_scope: bool = Field(default=False, strict=True)
    text: str = Field(min_length=1, max_length=16000)
    proposed_question: Question | None = Field(default=None, alias='proposedQuestion')
    sources: list[WebSource] = Field(default_factory=list, max_length=8)
    web_searched: bool = False
    searched_at: str | None = None


    @field_validator('text')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Assistant reply must not be blank.')
        return value.strip()
