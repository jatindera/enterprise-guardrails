from uuid import uuid4
import pytest
from app.modules.ea_meeting_reviews.schemas import Citation
from app.modules.ea_meeting_reviews.validation import align_citation, CitationError, unwrap_json


def citation(quote,line=99):
    return Citation(kind='transcript',id=uuid4(),line=line,quote=quote)


def test_unique_exact_quote_is_reanchored_to_actual_line():
    cite=citation('Retention is 30 days.')
    assert align_citation(cite,{('transcript',str(cite.id)):['Header','Retention is 30 days.']})
    assert cite.line==2 and cite.quote=='Retention is 30 days.'


def test_whitespace_only_alignment_uses_actual_source_text():
    cite=citation('Retention is 30 days.')
    assert align_citation(cite,{('transcript',str(cite.id)):['Header','Retention is','30 days.']})
    assert cite.line==2 and cite.quote=='Retention is\n30 days.'


@pytest.mark.parametrize('lines,quote,code',[
    (['Retention is 30 days.'],'Retention is 90 days.','quote_not_found'),
    (['Yes.','Yes.'],'Yes.','ambiguous_quote'),
])
def test_invented_or_ambiguous_quotes_remain_rejected(lines,quote,code):
    cite=citation(quote)
    with pytest.raises(CitationError) as result:align_citation(cite,{('transcript',str(cite.id)):lines})
    assert result.value.code==code


def test_unknown_source_remains_rejected():
    with pytest.raises(CitationError,match='unknown_source'):align_citation(citation('Real text'),{})


def test_json_fences_are_unwrapped_without_extracting_partial_prose():
    assert unwrap_json('```JSON\r\n{"summary":"ok"}\r\n```')=='{"summary":"ok"}'
    assert unwrap_json('Here is {"summary":"ok"}')=='Here is {"summary":"ok"}'
