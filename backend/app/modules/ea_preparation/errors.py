"""Safe inference failure codes; never include prompts or provider response bodies."""
class EAInferenceError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)
