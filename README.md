Duorian: client-server 두 단계로 web content를 parsing하는 시스템.
client 파트는 알고리즘 기반의 TypeScript 라이브러리이며, server 파트는 sLM 기반의 python 라이브러리이다.
client는 주요한

이 프로젝트는 그 중 client 파트이다.

# 개요
Server로 전송할 html content를 경량화/색인화한다.
- client 파트에서는 완전한 parsing을 하는 것을 목적으로 하지 않는다.
- main parser인 server에 전송하기 위한 packing을 목적으로 한다.


# 동작 플로우