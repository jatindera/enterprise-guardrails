import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createHumanReview,getHumanReview,getHumanVersion,portfolioEAStatus,reopenHumanReview,saveHumanReview,submitHumanReview} from '../src/api/eaHumanReviews';
vi.mock('../src/auth/authClient',()=>({getAccessToken:vi.fn(async()=> 'test-token')}));
let fetchMock:ReturnType<typeof vi.fn>;
beforeEach(()=>{vi.stubGlobal('window',globalThis);fetchMock=vi.fn(async()=>Response.json({ok:true}));vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());
it('uses authenticated human-review endpoints and backend field names',async()=>{
  const signal=new AbortController().signal;
  await getHumanReview('5276',signal);await getHumanVersion('5276','human');
  await createHumanReview('5276','new-human',{sourceReviewId:'ai',expectedProjectRevision:7});
  await saveHumanReview('5276','human','save-request',{expectedRevision:3,reviewText:'Unchanged source',technologyStack:'SQL',technologyRationale:'Storage',complexity:'Low',decision:'Approved',decisionRationale:'Accepted',conditions:''});
  await submitHumanReview('5276','human','submit-request',4,7);
  await reopenHumanReview('5276','human','reopen-request',5,8,'Scope changed');
  expect(fetchMock.mock.calls.map(c=>String(c[0]).split('/api/')[1])).toEqual([
    'projects/5276/ea-assessment','projects/5276/ea-assessment/reviews/human','projects/5276/ea-assessment/reviews/new-human',
    'projects/5276/ea-assessment/reviews/human/save/save-request','projects/5276/ea-assessment/reviews/human/submit/submit-request',
    'projects/5276/ea-assessment/reviews/human/reopen/reopen-request']);
  for(const call of fetchMock.mock.calls)expect(new Headers((call[1] as RequestInit).headers).get('Authorization')).toBe('Bearer test-token');
  expect(JSON.parse((fetchMock.mock.calls[4][1] as RequestInit).body as string)).toEqual({expectedRevision:4,expectedProjectRevision:7,confirmed:true});
  expect(JSON.parse((fetchMock.mock.calls[5][1] as RequestInit).body as string)).toEqual({expectedRevision:5,expectedProjectRevision:8,reason:'Scope changed'});
});
it('retains HTTP 409 information for conflict handling',async()=>{
  fetchMock.mockResolvedValueOnce(Response.json({detail:'Human review changed'},{status:409}));
  await expect(getHumanReview('5276')).rejects.toMatchObject({status:409,message:'Human review changed'});
});
it('maps backend conditional approval to the existing portfolio status',()=>{
  expect(portfolioEAStatus('Conditional approval')).toBe('Conditional');expect(portfolioEAStatus('Approved')).toBe('Approved');
  expect(portfolioEAStatus('Pending')).toBe('Pending');
});
