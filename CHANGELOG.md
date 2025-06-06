# Changelog

主な変更内容と変更内容を記載します。次回バージョン更新時に、検討・提案内容を引き継ぎます。

## To Do

### Wants (追加したい機能)
- UI
  - verticalは値域で制限をかけるため表現を調整
- スマホ
  - スマートフォン版のため、曲線色選択を現在のパレット以外の方法でも提供（矢印右に設定ボタン等）
  - モバイル用ヘッダーの作成(save, import機能のみ)
  - スマホ版でグラフの領域を変えられる機能

- 機能
  - Desmos専用のJsonファイル作成
  - 複数選択で曲線スタイル変更・削除
  - Ctrl+Z, Ctrl+Yなどキーイベントの設置
    - 元に戻す、進める、複数選択
  - ツール内で描いた絵を、リンクを踏むだけでDesmosグラフ計算機で利用できるようにする
  - 節点削除の操作（定義域の右にバツまたは節点クリック）
  - svgファイルをimportし、パスを数式化
  - サイドバーを閉じる機能（Right Panel Open, Left Panel Open, Keyboard Double Arrow Down）
  - svgをパスで編集するかのような操作感
  - 曲線拡大縮小切り替えボタンの追加
  - 節点を個別で削除する機能
    - 二次曲線
  - 曲線の拡大縮小、平行移動などの機能がまとまったツール群をトグルで表示非表示できるようにする
    rebase_editのアイコンが節点削除に適している
    節点の位置で近似できるメソッドがあるため、点にクリックイベントを付けて連携
  - JSONデータまたはファイルを張り付けでimportできる機能
  - PC, スマホ版のどちらも数式リストを閉じる機能

- 内部処理
  - キャンバスのドメイン外に曲線のboundRectがある場合、描画しない最適化
  - 節点を変更したときに履歴に追加するかどうか（inputイベントで曲線の形を確認しつつ調整したい）
  - 折れ線近似 セグメントの近似を直線近似に変更
  - グラフ計算機上の曲線を選択できる機能が無効になっているため使えるようにする
  - JSONデータの圧縮機能
  - 平行移動をoriginalPointsを使用せずにできるように

- サイドバー
  - グラフ計算機上に表示されているグラフのみリストに表示
  - リストをクリックしたら曲線に飛ぶ機能

### Suggestions (既存のシステムを変えればすぐに実現できるが、ユーザ目線で適宜変更可能)
- 現在は、節点数を変更したときに履歴に追加していない（inputイベントで曲線の形を確認しつつ調整したい）
- 節点が非表示時に、二次曲線の節点数スライダーを操作すると節点が表示されている。（変更するならcreateKnotCountSliderを調整）
- JSONデータをロードしたときに、曲線近似設定も上書きするかどうか（SettingsManager.applySettingsを調整）
- 曲線オプション表示設定を反映させるかどうか
- toolモードがpenのときに曲線移動を有効にするかどうか CurveMovementHandler.js handleMouseDown(), updatePenToolState()

## バージョン履歴

## [v-1.0.3] - 2025-05-26
- 曲線近似設定モーダルのスタイルを微調整
- 画面の縮小限界を10^5に制限
- ブラウザを移動するときにアラートを表示
- 数式コピーをDesmosのpiecewiseに対応
- 左右のトラックのズーム挙動の改善
- 一部翻訳されていない個所を修正
- 近似不可能モーダルが表示されないのを修正
- Ctrl+Z, Y, Sのkeydownイベントを追加
- 近似不可能モーダル表示を記憶するように変更
- モーダルウィンドウを刷新
- 節点数を減らした状態で再近似すると戻るのを修正

## [v-1.0.2] - 2025-05-21
- ハンバーガーメニューを作成
  - ウェブストレージに保存されたデータをブロックごとに表示
- グラフタイトル領域を作成
- グラフを保存する機能を追加
  - 10文字のハッシュ文字列で管理
  - 履歴に変化があるまでボタン無効化
- グラフ計算機追加機能
  - Base64データ取得用メソッド
  - JSON文字列取得用メソッド
- クエリ文字列からグラフデータを復元する機能の追加
- 二次曲線以外の曲線の元データが保存されていないのを修正

## [v-1.0.1] - 2025-05-19
- PCでzoom挙動の修正 add feat prefix

## [v-1.0.0] - 2025-05-18
- GraPen v-1.0.0 公開
- 基本動画作成
- 'modal/TutorialModal.js'に日本語と英語版のurl挿入

## [b-1.4.24] - 2025-05-18
### 修正
  - アラートモーダルの国際機能追加
  - アラートモーダルが翻訳されていないのを修正
  - 各種削除モードが翻訳されていないのを修正
  - グラフ計算機のバージョンを更新

## [b-1.4.23] - 2025-05-17
### 修正
  - ApproximatorManagerモーダルの閉じる挙動を修正
  - 折れ線近似の節点配置を修正
### 追加機能
  - 言語設定の追加
  - GitHubリンクを追加

## [b-1.4.22] - 2025-05-16
### 修正
  - 610px以下になったときにマウスカーソルのアイコンを指のアイコンになるように変更
  - graph/README.mdに機能を追加記述
### 追加機能
  - スマホのタッチイベントを強化し追加
  - ローディング画面を追加

## [b-1.4.21] - 2025-05-15
- **提案**
  - GraphCalculator.jsにスマホのタッチイベントを追加したファイルを作成

## [b-1.4.20] - 2025-05-13
### 修正
  - curve-itemを入れ替えたときにcolor-iconが正しく反映されないことの修正
  - 曲線移動切り替えボタンのz-indexを調整
  - ペンの描画をsvg領域内ではなくdocument全体に変更
  - webアプリ全体をテキスト選択、コピーを防ぎ意図しない操作の修正


## [b-1.4.19] - 2025-05-12
### 修正
  - 曲線のスタイルが正しく保存されていないことの修正
  - 曲線の太さが復元できないことの修正
  - ペン設定モーダルウィンドウを必ず閉じなければ次の操作ができないよう挙動修正
  - undo, redoで曲線選択状態の表示が解除されるのを修正
  - penモード時、曲線移動が無効であるスタイルの表示の追加
  - 曲線が移動された距離が0のとき履歴に記録されないよう修正
  - 曲線移動後に選択したときに強調表示のパスが変わらないことの修正
  - 曲線移動を無効に戻した時のカーソルのスタイルを調整
  - イベントリスナーをd3.jsのイベントリスナーに変更
  - curve-itemの動きの最適化


## [b-1.4.18] - 2025-05-11
### 修正
  - 平行移動時 数式をx, y軸方向の移動をわかりやすく色で表示
  - 平行移動時の符号修正
  - x = a, y = aの判定を修正。より直線として判断できるように
  - 直線と折れ線近似の優先度を変更
  - 数式を左寄せに調整
  - 画面構成の修正
  - マウスカーソルの状態を修正
  - 数式DOM更新を個別に修正
  - 二次曲線近似の節点数を修正
### 追加機能
  - 数値変換の機能が集まったNumberUtil.jsの作成
  - 平行移動機能のundo, redoを追加


## [b-1.4.17] - 2025-05-10
### 修正
  - 平行移動時に直線、折れ線近似が正しく実行されるよう修正
  - 二次曲線近似の節点配置を調整
    自由な節点数設定となったため、返り値でmaxKnotsを設定する必要あり
  - 一次関数、二次関数の数式を標準形から平方完成に変更
- **備考**
  数式をリアルタイムで更新 getParallelMovedFormula()
  - 曲線移動・表示にも近似を実行中
  - x, y座標をハイライトした数式平行移動に不整合
  - 曲線移動中のupdateDummyCurve()関連で近似せず直接transformにする


## [b-1.4.16] - 2025-05-08
### 追加機能
  平行移動クラスCurveMovementHandler.jsを作成


## [b-1.4.15] - 2025-05-06
### 修正
  - デフォルトの線の太さを6px, 点の大きさを10pxに変更
  - 節点の数スライドバー、ボタンのスタイルを調整
  - 曲線の表示オプションを保存するように変更
### 追加機能
  - 曲線移動


## [b-1.4.14] - 2025-05-05
### 修正
  - 曲線設定ボタンのスタイルが反転しているのを修正
  - 設定ボタン生成のプライベートメソッドを作成
  - 一部のイベントで設定が反映されていないのを修正
  - 曲線生成時に節点の設定を参照するように修正
  - データをインポートしたときにグラフのドメインが変更されないように修正
  - 点のデフォルトスタイルを変更
  - 節点の優先度を-Infinityから数値に変更
  - データをインポートしたときに節点の数を変更したときに正しく反映されないのを修正
  - 点のスタイルを削除しJSONデータの削減

## [b-1.4.13] - 2025-05-04
### 修正
  - 節点の数変更時に点が更新できないのを修正
  - 曲線IDをiタグからspanに変更、no-copyスタイルを適用
  - 最小節点数を2に変更
  - 間違って設定していたX軸とY軸のアイコンを入れ替え
  - ペンの太さのアイコンを追加
  - ペンのカラーアイコンを追加
  - saveJSONで足りないパラメータを補充
    節点データ, 数式タイプ, 曲線の節点数, 曲線の最小節点数, 曲線の最大節点数, originalPoints
### 追加機能
  - GraphCalculator.jsにremoveAllPointsメソッドを追加

## [b-1.4.12] - 2025-05-03
### 修正
  - curve-itemをつかんだ際に実体化するように変更
  - curve-itemのどの間に挿入しようとしているのかバーを表示
  - ゴミ箱に捨てるアニメーションの追加
  - 折れ線近似クラスの垂直、水平判定の節点の位置を修正
### 追加機能
  二次曲線近似クラスに節点を指定し近似するメソッドを追加
  節点の数を調整するスライダーを追加


## [b-1.4.11] - 2025-05-02
- FILE_STRUCTURE.mdの削除
### 修正
  - import機能の修正
  - グラフ計算機の拡大縮小限界が正しく設定できていない箇所を修正
  - 二次曲線近似の節点設置の最適化
  - ツールバーのヘッダーの高さが変わる問題を修正
  - 曲線削除後にundo操作で節点が表示されない問題を修正
### 追加機能
  - 数式を内部パラメータtypeで判断しハイライトする機能の拡張
  - 新しい折れ線近似クラスの作成
  - curve-itemをゴミ箱にドラッグアンドドロップすると削除できる機能

## [b-1.4.10] - 2025-05-01
### 修正
  - 二次曲線近似アルゴリズムを大幅修正  
    - `BSplineApproximator.js`  
    - `QuadraticBSplineCurveApproximator.js`
  - 一価関数近似switchアルゴリズム修正
  - `ApproximatorManager.js`の設定変数を適用するよう修正
### 追加機能
  - 定数関数、一次関数近似クラス追加
  - 数式ハイライトを定数関数、一次関数でも対応


## [b-1.4.9] - 2025-04-25
### 修正
  - 曲線のスタイル変更
  - ペンツールクラスの修正
### 追加機能
  - 曲線近似管理マネージャーの追加  
    - 設定変数の管理  
    - 節点表示・非表示機能追加


## [b-1.4.8] - 2025-04-21
### 修正
  - 曲線選択のイベントを修正  
    - 節点の点を曲線の太さ依存ではなく、固定に変更


## [b-1.4.7] - 2025-04-16
### 追加機能
  - アラートモーダルクラスを作成
  - 近似失敗、同じ色登録のアラートオブジェクトを変更
  - 近似失敗モーダル画面を変更 `_showApproximationAlert()`
  - dash-arrayの間隔を拡大縮小でも変わらないよう修正
  - グラフ選択解除のイベント修正
  - fontawesomeからGoogle fontに変更 v_05 - google


## [b-1.4.6] - 2025-04-15
### 修正
  - save jsonのバージョン更新（点に関する）
  - プロパティの変更
  - マウスクリックのみの描画バグ修正
  - 曲線詳細が開いているときにcolor-iconクリック時に閉じる機能を削除
  - 曲線非表示時にハイライト曲線を表示しないよう修正
  - `UIManager.js` redo undoを`historyManager.js`に移動


## [b-1.4.5] - 2025-04-13
### 修正
  - 点のスタイルのredoを修正
  - 点のスタイルを修正


## [b-1.4.4] - 2025-04-12
### 修正
  - 点のスタイルを修正


## [b-1.4.3] - 2025-04-10
### 修正
  - curvesの管理を修正
  - `GraphCalculator.js`に曲線表示・非表示メソッド追加
  - 点のスタイル修正
  - 点追加のundo, redoの修正


## [b-1.4.2] - 2025-04-06
### 修正
  - アイコン、ヘッダーロゴをimgからsvgタグに変更
  - 二次曲線近似を修正
### 新規追加
  - svgの構成を変更
  - グラフ計算機にaddPointメソッド追加
  - 曲線の節点を表示する機能追加
  - 節点の表示を切り替える機能追加


## [b-1.4.1] - 2025-04-05
- 新規追加 /v_05
### 新規追加
  - 二次曲線近似に二次関数式を作成するメソッド追加
  - 二次関数式をUIに渡す連携
  - `CurveManager.js`  
    - タイムライン形式で二次関数を表示する機能  
    - 数式コピーボタンの設置
  - `EquationHighlighter.js`  
    - カーソルを合わせると曲線がグラフ計算機上でハイライトされる機能追加
  - `GraphCalculator.js`, `GraphSaveUtils.js`
  - グラフ計算機にスタイルのオプションを追加
  - アラートを表示するManager.jsを作成（ペン選択のモーダルウィンドウ、一価関数エラーに利用）
  - グラフ計算機の拡大縮小限界を追加（10^-7 ~ 10^10）
### 修正
  - 軸をgタグでまとめ
  - 二次曲線近似を渡す座標の変換
  - 曲線アイテム選択・移動を上部に変更


## [b-1.4.0] - 2025-04-04
- 新規追加 /v_05
### 修正
  - 軸をgタグでまとめ
  - グラフキャンバスのサイズが変わった時にホームボタン押すと縮尺が変わる問題を修正
### 新規追加
  - svg文字列の拡大縮小移動メソッド追加
  - `js/approximator`
    - `division` (曲線分割クラス)  
      - `UIManager.js`と連携し近似(仮)機能作成  
      - 想定した近似はできていない
    - `path` (最適なpath選択クラス)
    - `quadratic` (2次曲線近似クラス)


## [b-1.3.5] - 2025-04-03
### 修正
  - モバイル画面のペン選択のモーダルウィンドウサイズ調整（ヘッダー削除）
  - ペン選択のモーダルウィンドウ内  
    - 太さ変更プラスボタン、マイナスボタンに変更  
    - ゴミ箱ボタン無効機能  
    - ゴミ箱配置変更
  - 曲線リスト内に曲線がない場合ゴミ箱を無効に
### 追加機能
  - window resizeでモーダルウィンドウを非表示に
  - escキーでモーダルウィンドウを非表示に
  - カラーパレットにスクロール追加
  - モバイル画面時プレビューを非表示に
  - スクロールバー(`css/scrollbar.css`)を独自のものに変更
  - 高度な編集モード追加


## [b-1.3.4] - 2025-04-02
### 修正
  - スマートフォン画面時のスタイル調整
  - x軸とy軸のグリッド範囲を統一（x軸で固定）
  - zoomIn, zoomOutを画面中心に修正
  - 大きな数、小さな数の軸のラベルを指数に変更
  - Times New Roman, Times, serifに変更
  - スマートフォン画面時アイコンのサイズ調整
### 追加機能
  - [+] [-] ボタンを設置（スマートフォン画面では非表示）
  - ドメイン範囲の設定


## [b-1.3.3] - 2025-04-01
### 修正
  - 削除モード中に他の操作ができないように
  - export, settingモーダル表示後にペン選択クリックするよう修正


## [b-1.3.2] - 2025-03-31
### 追加機能
  - 削除モードを追加  
    - プルダウンメニューを×ボタンにする洗練されたUI
### 修正
  - UIをカラー選択からペン選択に統一
  - 曲線状態変更の Undo, Redoを記録


## [b-1.3.1] - 2025-03-30
### 修正
  - 選択した曲線の色をリアルタイムで変更する機能修正
  - デフォルトの色をクリックできるよう修正
  - 新規色登録直後に閉じないよう修正
  - 削除モードを取り消し閉じるように修正
  - カラー設定と曲線の太さを`PenToolManager.js`に集約
  - sizeスライドバーをマウスを離したときにundoスタックに追加するよう変更
  - チュートリアル画面を消した後、1週間後に表示するよう調整
### 追加機能 - v_04
  - 同じ色を登録したときにアラート文を追加
  - 曲線の表示・非表示ボタン  
    - jsonデータにも導入
  - Undo, Redo矢印に無効を追加（進めるかどうか一目でわかる）
- **UI調整**
  - カラーパレット、太さ調整のボタンをグラフ計算機左上固定に  
    - パレットの絵文字自体の色を変更  
    - ペンの太さがスライドバー調整で一目で太さがわかるように


## [b-1.3.0] - 2025-03-29
### UIとグラフ計算機との完全連携 - v_03
  - キャンバスの状態とグラフの状態を連携
  - 追加した曲線の拡大縮小機能の復元
  - 設定画面モーダルウィンドウ  
    - キャンバス状態の表示・非表示
  - カラー選択モーダルウィンドウ表示時、設定ボタン押しても閉じないバグ修正
  - UI系のコードをまとめた
  - Undo, Redo一部修正
### 追加機能
  - PNG, SVG, Json保存機能追加
  - Jsonインポート機能追加
  - カラーピッカーを設定画面と同じデザイン＋よりモダンに  
    - カラーパレットの自由な色の追加  
    - 削除モード追加  
    - デフォルトの色を削除できないよう明確に  
    - chromeローカルストレージにパレットを保存
  - 軸のスタイル変更  
    - 矢印、ラベル
  - チュートリアルの表示


## [b-1.2.6] - 2025-03-28
### UIとグラフ計算機との連携 - v_03/graph
  - 描いた曲線をリアルタイムで表示
  - 曲線をグラフ計算機に追加
  - 選択した曲線の色や太さを変更
  - 選択した曲線の強調表示


## [b-1.2.5] - 2025-03-27
### SVG文字列を使った曲線の追加 - v_03/graph
  - IDの自動付与
  - 曲線情報の取得
  - 曲線の編集
  - オプション、パラメータの設置
  - ペンで描いた曲線を追加


## [b-1.2.4] - 2025-03-26
- ペンで描いた曲線をsvg containerに追加は未対応


## [b-1.2.3] - 2025-03-25
### キャンバス部分のプロトタイプ作成 - v_03, graphCalculator
  - /graph 部分にグラフ計算機のモジュール設置
  - 後に連携予定


## [b-1.2.2] - 2025-03-24
### Canvas_Domain_Bug
  - `CanvasManager.js/handleZoom()` 85-93行
  - event.transformなどは正しい
  - ドメイン計算に問題あり
  - 分割線をマウスの先で動かせるように変更


## [b-1.2.1] - 2025-03-23
- キャンバスステータス修正
- 分割線移動によるキャンバスサイズ変更のステータス更新
- v_01 a/
- **[b-Canvas_Domain_Bug]**
  - `CanvasManager.js/handleZoom()` 85-93行
  - event.transformなどは正しい
  - ドメイン計算に問題あり

  _svgのズーム   CanvasManager.js handleZoom()_  
  _分割線ドラッグ UIManager.js    setupResizeEvents()_


## [b-1.2.0] - 2025-03-22
- クラス化
- カラーピッカー作成
- キャンバスステータス修正
- クラス化
- ペンでクリックしても追加しないように
- 左画面の初期値を350pxに変更
- 左右画面の挙動修正
- ロゴ設置
- ヘッダー設置
- カラーピッカーを独自で作成
- 曲線リストの選択時、色変更時のシステムシナリオ修正
- FILE_STRUCTURE.mdの追加
- キャンバスステータス修正


## [b-1.1.0] - 2025-02-24
- サイドバーとキャンバスを逆に配置とレイアウト修正
- サイドバー, キャンバスの配置をDesmos風に変更(左右逆に)
- ウィンドウサイズ変更時にレイアウトが崩れないよう修正
- divider_test.htmlのプロトタイプを作成
- フォルダの再編
- CHANGELOG.mdの作成


## [b-1.0.0] - 2025-02-23
### 初回リリース
- delete 押したときにidが正しく更新されるよう修正  
  pen-v0-1.htmlはその更新前の状態
- グラフ軸の前にグラフが表示されるよう修正
- d3.jsに変更
- ▲に変更
- それを押すと詳細が表示されるよう修正(これは数式に置き換え)
- 選択できるよう修正(idを取得できるのみ)
- 入れ替えても状態が変わらないよう修正
- 選択中に色や曲線を選ぶと反映されるよう修正
- curve-listの外を押すと解除されるよう修正
- 選択したらその曲線の色と太さが反映されるよう修正
- 選択を解除したら元の設定が戻るよう修正
- showDetail関数を統一 hidden:true のときに閉じるよう修正
- 選択した際に曲線を強調できるよう修正
- 選択した曲線の色が追従するよう修正
- 選択した曲線のスタイルを変更できるよう修正
- 選択中に色、太さを変更したときに、選択している曲線の色も変更されるよう修正
- 曲線の端を丸く修正
- カラーやスライドイベントをその都度記録するのではなく、離したときに記録するよう修正
- デザインを大幅変更  
    - アイコンをfont awesomeにすべて変更
- デザイン変更に伴い id, classが変わったためjsとの連携  
    - showDetails, deleteが効くよう修正 pointer-event: none
    - 太さを変更して曲線を描いても反映されるよう修正
- レスポンシブデザイン対応
- カラーピッカーの横幅サイズを自動調整
- 選択している状態で削除した場合、選択前の状態に戻るよう修正
- 初回起動時にペンのcrosshair状態に設定
- 選択して色を変更する際に小窓の色も変更されるよう修正
- 選択解除したら設定を戻すよう修正
