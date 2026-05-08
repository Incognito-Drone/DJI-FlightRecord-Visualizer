# DJI-FlightRecord-Visualizer
본 로컬 GUI툴은 dji-log-parser를 이용하여 DJI FLY앱내에서 추출한 flightRecord txt파일과 DJI FLY api키를 입력받아 로그를 복호화하고, 비행 로그에 기반한 기체 정보, 2D 비행 경로, 3D 비행 경로 시뮬레이터를 제공합니다.

## Technology Stack
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![Flask](https://img.shields.io/badge/flask-%23000.svg?style=for-the-badge&logo=flask&logoColor=white)
![Rust](https://img.shields.io/badge/rust-%23000000.svg?style=for-the-badge&logo=rust&logoColor=white)


---

## 목차
1. [실행](#실행)
2. [특징](#특징)
3. [기여자 표](#기여자-표)
4. [아키텍처](#arch)
5. [화면 구성](#화면-구성)

---

<a id="실행"></a>
## 실행

```powershell
python -m pip install -r requirements.txt
python flightlog_gui.py
```

브라우저에서 `http://127.0.0.1:5000`을 엽니다.

분석을 위해서 DJI FLY앱에서 추출한 FlightRecord txt파일과 DJI FLY open API키가 요구됩니다.

https://developer.dji.com/

API키는 이곳에서 발급받을 수 있습니다.

---

<a id="특징"></a>
## 특징

- `frames[].osd` 기반으로 위치, 고도, yaw/pitch/roll, 수평/수직 속도를 정규화합니다.
- 재생 타이밍은 실제 프레임 시간(`flyTime`)을 우선 사용하므로 상승과 하강 속도 변화가 그대로 반영됩니다.
- 지도는 OpenStreetMap 타일을 시도하고, 실패하면 좌표 기반 오프라인 뷰로 자동 폴백합니다.
- 3D 뷰는 고도와 자세 값을 함께 사용해 드론의 움직임을 캔버스에서 재생합니다.

---

<a id="기여자-표"></a>
## 기여자 표

<h3>Project Team</h3>

<table>
  <thead>
    <tr>
      <th>Profile</th>
      <th>Role</th>
      <th>Materialize</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center">
        <a href="https://github.com/MEspeaker">
          <img src="https://github.com/MEspeaker.png" width="60"/><br/>
          MEspeaker
        </a>
      </td>
      <td align="center">Project Member</td>
      <td align="center">GUI툴 개발, Android DJI FLY 포렌식</td>
    </tr>
    <tr>
      <td align="center">
        <a href="https://github.com/jiyoon77">
          <img src="https://github.com/jiyoon77.png" width="60"/><br/>
          jiyoon77
        </a>
      </td>
      <td align="center">Project Member</td>
      <td align="center">문서 작성, IOS DJI FLY 포렌식</td>
    </tr>
  </tbody>
</table>

---

<a id="arch"></a>
## 아키텍처 
<img width="1448" height="1086" alt="Image" src="https://github.com/user-attachments/assets/5ca6094e-66bb-459d-8305-3e306e28ad83" />

---

<a id="화면-구성"></a>
## 화면 구성

| **대시 보드** | **MAP(기본)** |
|---------------|----------------|
| <img width="1470" src="https://github.com/user-attachments/assets/28b4dce6-b08a-4a9e-bc50-5c20065b80fc" /> | <img width="1470" src="https://github.com/user-attachments/assets/ccdac45c-48d6-4083-8620-1fe79838d403" /> |

| **MAP(위성)** | **3D Motion** |
|-----------------|-----------------|
| <img width="1470" src="https://github.com/user-attachments/assets/49167075-3c35-454c-945a-a3e6ce90a00a" /> | <img width="1470" src="https://github.com/user-attachments/assets/0d0e9d8f-5c4f-482b-a2fa-32cb3ed56404" /> |
