class ParserException(Exception):
    def __init__(self, message: str, raw_message_id: str = "") -> None:
        self.message = message
        self.raw_message_id = raw_message_id
        super().__init__(message)


class RedisConnectionError(Exception):
    pass
