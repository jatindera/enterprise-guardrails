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


def test_reference_copies_original_line_and_marks_long_excerpt():
    from app.modules.ea_meeting_reviews.schemas import SourceReference
    from app.modules.ea_meeting_reviews.validation import resolve_reference
    ref=SourceReference(kind='transcript',id=uuid4(),line=2)
    original="Priya: "+("Original source text. "*30)
    result=resolve_reference(ref,{('transcript',str(ref.id)):['Header',original]})
    assert result.quote==original[:240]
    assert result.excerpt_truncated is True
    assert result.line==2


@pytest.mark.parametrize('lines,line,code',[
    (['Header'],2,'line_out_of_range'),
    (['Header','  '],2,'blank_source_line'),
])
def test_reference_does_not_guess_replacement_lines(lines,line,code):
    from app.modules.ea_meeting_reviews.schemas import SourceReference
    from app.modules.ea_meeting_reviews.validation import resolve_reference
    ref=SourceReference(kind='transcript',id=uuid4(),line=line)
    with pytest.raises(CitationError,match=code):
        resolve_reference(ref,{('transcript',str(ref.id)):lines})


def test_reference_cannot_request_an_unknown_source():
    from app.modules.ea_meeting_reviews.schemas import SourceReference
    from app.modules.ea_meeting_reviews.validation import resolve_reference
    with pytest.raises(CitationError,match='unknown_source'):
        resolve_reference(SourceReference(kind='transcript',id=uuid4(),line=1),{})


@pytest.mark.parametrize('line',[True,'1',0,-1])
def test_reference_line_must_be_a_positive_integer(line):
    from pydantic import ValidationError
    from app.modules.ea_meeting_reviews.schemas import SourceReference
    with pytest.raises(ValidationError):
        SourceReference(kind='transcript',id=uuid4(),line=line)


def test_generated_quote_is_not_part_of_reference_contract():
    from pydantic import ValidationError
    from app.modules.ea_meeting_reviews.schemas import SourceReference
    with pytest.raises(ValidationError):
        SourceReference.model_validate({'kind':'transcript','id':str(uuid4()),
            'line':1,'quote':'Model-created quote must not be trusted'})
