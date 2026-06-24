#!/bin/bash

echo "Regio 애플리케이션 설치를 시작합니다..."

echo
echo "1. Node.js 의존성 설치 중..."
npm install

echo
echo "2. .env 파일 생성 중..."
if [ ! -f .env ]; then
    cp env.example .env
    echo ".env 파일이 생성되었습니다."
else
    echo ".env 파일이 이미 존재합니다."
fi

echo
echo "3. PostgreSQL 데이터베이스 설정 확인..."
echo "PostgreSQL 서버가 실행 중인지 확인하세요."
echo "'regio' 데이터베이스가 생성되어 있는지 확인하세요."
echo
echo "데이터베이스 생성 명령어:"
echo "psql -U postgres -c \"CREATE DATABASE regio;\""
echo
echo "스키마 적용 명령어:"
echo "psql -U postgres -d regio -f database.sql"

echo
echo "4. 서버 시작..."
echo "npm start 명령어로 서버를 시작할 수 있습니다."
echo "또는 npm run dev 명령어로 개발 모드로 시작할 수 있습니다."

echo
echo "설치가 완료되었습니다!"
echo "http://localhost:3000 에서 애플리케이션에 접속할 수 있습니다."
