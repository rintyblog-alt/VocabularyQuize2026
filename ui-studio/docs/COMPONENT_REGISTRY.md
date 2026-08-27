# COMPONENT_REGISTRY — 登録済みコンポーネント台帳

> 新規UIはこの台帳にあるものだけで組む。不足時は追加→カタログ掲載→この台帳更新→使用の順。
> import元: `src/ui/components`（バレル）

## Actions
| コンポーネント | Props要点 | Studioページ |
|---|---|---|
| `Button` | variant: primary/secondary/outline/ghost/danger/danger-soft/success/link · size sm/md/lg · loading · icon | /components/buttons |
| `IconButton` | **label必須**(aria) · variant ghost/outline/primary · active | /components/buttons |
| `ButtonGroup` | 子Buttonを連結（split button含む） | /components/buttons |

## Inputs
| `Field` | label/hint/error/required/count。childrenは関数(id受取)か要素 | /components/inputs |
| `TextInput` | size · icon · trailing · addon · invalid | /components/inputs |
| `PasswordInput` | 表示切替内蔵 · onCapsLock | /components/inputs |
| `SearchInput` | value/onChange · クリアボタン内蔵 | /components/inputs |
| `Textarea` | invalid | /components/inputs |
| `Select` | ネイティブselect + 独自chevron · icon | /components/inputs |
| `OTPInput` | length · ペースト対応 · invalid(shake) | /components/inputs |
| `Checkbox` | indeterminate対応 | /components/selection |
| `Radio` | リッチlabel可 | /components/selection |
| `Switch` | 即時反映のON/OFF専用 · size sm/md | /components/selection |
| `Slider` | value必須(fill表示) | /components/selection |

## Navigation & Structure
| `Tabs` | items{id,label,count,disabled} · 矢印キー対応 | /components/tabs |
| `Segmented` | 表示切替・範囲切替用 | /components/tabs |
| `Breadcrumbs` | 3階層以上で使用 | /components/navigation |
| `Pagination` | 省略記号自動 | /components/navigation |
| `CommandPalette`(app層) | ⌘K。ナビ+アクション | /components/navigation |

## Display
| `Badge` | tone 9種 · dot | /components/display |
| `Tag` | onRemoveで削除可能 | /components/display |
| `Chip` | aria-pressed選択。フィルター用 | /components/display |
| `Avatar` | イニシャル自動生成 · size xs–xl · online · square | /components/display |
| `AvatarGroup` | max超は +N | /components/display |
| `Divider` | label / vertical | /components/display |
| `Kbd` | ショートカット表示 | /components/display |
| `Card` | pad/hover/flat/sunken/selected | /components/cards |
| `StatCard` | KPI。delta/tone | /components/cards |
| `ListItem` | leading/title/description/trailing。**trailingが操作を持つ行にonClickを付けない** | /components/cards |

## Overlays
| `Modal` | size md/lg/xl · footer · モバイルでBottom Sheet化 · Esc/外側クリック | /components/overlays |
| `Drawer` | side left/right · width | /components/overlays |
| `Dropdown` | items{icon,label,hint,danger,separatorAbove} | /components/overlays |
| `Tooltip` | hover/focusで表示 | /components/overlays |

## Feedback
| `ToastProvider` + `useToast` | tone 5種 · action(取り消し) · 自動消滅 | /components/feedback |
| `Alert` | tone info/success/warning/danger/ai · actions | /components/feedback |
| `Banner` | 画面上部の帯 | /components/feedback |
| `EmptyState` / `OfflineState` | icon/title/desc/actions | /components/feedback |
| `Spinner` / `Skeleton` | Skeletonは実レイアウト同形で | /components/feedback |
| `Progress` / `Ring` | Ringはタイマー・円形進捗 | /components/feedback |
| `Stepper` | 複数ステップフォーム | /components/feedback |

## Data
| `DataTable<T>` | columns(sortable/numeric/render) · onRowClick · empty | /components/tables |
| `BarChart` / `LineChart` | 単一軸 · hoverツールチップ · 凡例自動 | /components/charts |
| `HBarList` | 分野別比較の横棒 | /components/charts |

## Hooks（src/ui/hooks.ts）
`useLocalStorage / useEscape / useClickOutside / useCountUp / useCountdown / useMedia / useScrollLock / useId2`

## 製品シェル（src/features）
| `AppFrame` | 製品全画面の骨格。PC=サイドバー / モバイル=BottomNav（コンテナクエリ） | /patterns/app-shell |
