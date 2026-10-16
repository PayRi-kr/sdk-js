# Changesets

이 폴더는 [changesets](https://github.com/changesets/changesets)로 버전과
체인지로그를 관리합니다.

변경 사항을 추가하려면:

```sh
pnpm changeset
```

릴리즈(빌드 후 게시):

```sh
pnpm release
```

> workspace 프로토콜(`workspace:^`)이 실제 버전으로 치환되도록 반드시 pnpm으로
> 게시하세요 (`npm publish` 직접 사용 금지).
