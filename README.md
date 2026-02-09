Duorian: client-server 두 단계로 web content를 parsing하는 시스템.
client 파트는 알고리즘 기반의 TypeScript 라이브러리이며, server 파트는 sLM 기반의 python 라이브러리이다.
client는 content 파트가 아닌 부분을 대강 정리하고, 분할 처리할 수 있게 정리하는 역할을 한다.

이 프로젝트는 그 중 client 파트이다.

# 개요
Server로 전송할 html content를 경량화/색인화한다.
- client 파트에서는 완전한 parsing을 하는 것을 목적으로 하지 않는다.
- main parser인 server에 전송하기 위한 packing을 목적으로 한다.
- 기존 라이브러리에서 상속하여 쓸 부분이 있으면 사용한다. 그러나 최대한 content를 보존하는 방향으로 유지해야 한다.


# 주의할 점
테스트케이스는 있을 수 있는 여러 시나리오 중 일부일 뿐이다. 테스트 케이스에 과적합된 코드를 작성하지 말 것.

# Duorian-server의 역할
이 프로젝트(Duorian-client)는 Duorian-server에 대강 parsable하게 정돈되고 pruning된 정보를 넘겨준다.
Duorian-server는 이를 이어받아, parsing을 위한 쿼리나 함수, 정규식을 생성하고 적용한다.