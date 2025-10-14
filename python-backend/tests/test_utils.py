from app.main import parse_number


def test_parse_number_simple():
    assert parse_number('123') == 123.0
    assert parse_number('1,234') == 1234.0
    assert parse_number('(1,234)') == -1234.0
    assert parse_number('12.34') == 12.34
    assert parse_number('50%') == 0.5
    assert parse_number('$1,234.56') == 1234.56
    assert parse_number('') is None
    assert parse_number(None) is None
