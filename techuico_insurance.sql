-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Apr 26, 2026 at 10:37 PM
-- Server version: 10.6.25-MariaDB
-- PHP Version: 8.4.16

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `techuico_insurance`
--

-- --------------------------------------------------------

--
-- Table structure for table `area`
--

CREATE TABLE `area` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `area`
--

INSERT INTO `area` (`id`, `name`) VALUES
(1, 'Mumbai');

-- --------------------------------------------------------

--
-- Table structure for table `category`
--

CREATE TABLE `category` (
  `id` int(11) NOT NULL,
  `name` varchar(259) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `category`
--

INSERT INTO `category` (`id`, `name`) VALUES
(4, 'A'),
(5, 'B'),
(6, 'C'),
(7, 'D'),
(8, 'E');

-- --------------------------------------------------------

--
-- Table structure for table `cdloanstatus`
--

CREATE TABLE `cdloanstatus` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `cdloanstatus`
--

INSERT INTO `cdloanstatus` (`id`, `name`) VALUES
(1, 'no');

-- --------------------------------------------------------

--
-- Table structure for table `chequestatus`
--

CREATE TABLE `chequestatus` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `chequestatus`
--

INSERT INTO `chequestatus` (`id`, `name`) VALUES
(1, 'yes');

-- --------------------------------------------------------

--
-- Table structure for table `city`
--

CREATE TABLE `city` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `city`
--

INSERT INTO `city` (`id`, `name`) VALUES
(1, 'Thane'),
(2, 'nasik');

-- --------------------------------------------------------

--
-- Table structure for table `courierstatus`
--

CREATE TABLE `courierstatus` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `courierstatus`
--

INSERT INTO `courierstatus` (`id`, `name`) VALUES
(1, 'yes');

-- --------------------------------------------------------

--
-- Table structure for table `loanstatus`
--

CREATE TABLE `loanstatus` (
  `id` int(11) NOT NULL,
  `name` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `loanstatus`
--

INSERT INTO `loanstatus` (`id`, `name`) VALUES
(1, 0);

-- --------------------------------------------------------

--
-- Table structure for table `member`
--

CREATE TABLE `member` (
  `m_id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `relation` varchar(255) DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `age` varchar(200) DEFAULT NULL,
  `date_of_joining` date DEFAULT NULL,
  `sum_insured` varchar(50) DEFAULT NULL,
  `comulative_bonus` varchar(50) DEFAULT NULL,
  `ph_no` varchar(200) DEFAULT NULL,
  `basic_premium` varchar(50) DEFAULT NULL,
  `ref_no` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `member`
--

INSERT INTO `member` (`m_id`, `name`, `relation`, `dob`, `age`, `date_of_joining`, `sum_insured`, `comulative_bonus`, `ph_no`, `basic_premium`, `ref_no`) VALUES
(295, 'Jayesh Nandu', 'Spouse', '1970-09-02', '', '2011-10-16', '', '', '', '14281', NULL),
(296, 'Nilam Devji Fariya', 'Spouse', '1992-10-29', '', '2019-10-17', '', '', '', '4653', NULL),
(297, 'Amritben Meghji Gada', 'Spouse', '1950-05-02', '', '2018-10-19', '', '', '', '27073', NULL),
(298, 'Devchand Arjan Chheda', 'Father', '1960-11-07', '', '2012-10-16', '', '', '', '22100', NULL),
(299, 'Bharti D. Chheda', 'Mother ', '1963-01-01', '', '2012-10-16', '', '', '', '20016', NULL),
(300, 'Ratanben Keshavji Chheda', 'Spouse', '1964-08-09', '', '2018-10-19', '', '', '', '18974', NULL),
(301, 'Kanchan Hasmukh Shah', 'Spouse', '1978-11-07', '', '2023-10-17', '', '', '', '8621', NULL),
(302, 'Krisha Hasmukh Shah', 'Daughter', '2008-11-16', '', '2023-10-17', '', '', '', '3156', NULL),
(303, 'Devansh Hasmukh Shah', 'Son', '2011-06-24', '', '2023-10-17', '', '', '', '2919', NULL),
(304, 'Panuben Navin Shah', 'Spouse', '1970-06-04', '', '2018-10-19', '', '', '', '14281', NULL),
(305, 'Veluben Damji Nandu', 'Spouse', '1967-04-08', '', '2015-10-16', '', '', '', '5466', NULL),
(306, 'Manasvi Damji Nandu', 'Daughter', '1996-12-03', '', '2015-10-16', '', '', '', '567', NULL),
(307, 'Krina Damji Nandu', 'Daughter', '2000-12-12', '', '2015-10-16', '', '', '', '567', NULL),
(308, 'Mahendra Ravji Vadhan', 'Spouse', '1973-11-10', '', '2019-10-17', '', '', '', '15807', NULL),
(309, 'Harshil Mahendra Vadhan', 'Son', '2007-11-01', '', '2019-10-17', '', '', '', '4302', NULL),

-- --------------------------------------------------------

--
-- Table structure for table `pincode`
--

CREATE TABLE `pincode` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `pincode`
--

INSERT INTO `pincode` (`id`, `name`) VALUES
(1, '412105');

-- --------------------------------------------------------

--
-- Table structure for table `policygroup`
--

CREATE TABLE `policygroup` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `policygroup`
--

INSERT INTO `policygroup` (`id`, `name`) VALUES
(1, 'svkk'),
(2, 'nvkk'),
(3, 'other'),
(4, 'rty');

-- --------------------------------------------------------

--
-- Table structure for table `policytype`
--

CREATE TABLE `policytype` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `policytype`
--

INSERT INTO `policytype` (`id`, `name`) VALUES
(1, 'Familiy-Floating'),
(2, 'Asha-kiran'),
(3, 'Individual');

-- --------------------------------------------------------

--
-- Table structure for table `policy_table`
--

CREATE TABLE `policy_table` (
  `policy_no` longtext DEFAULT NULL,
  `policy_type` varchar(250) DEFAULT NULL,
  `customer_id` varchar(250) DEFAULT NULL,
  `svvk_id` longtext DEFAULT NULL,
  `policy_holder` varchar(255) DEFAULT NULL,
  `pan_no` varchar(200) DEFAULT NULL,
  `company` varchar(250) DEFAULT NULL,
  `tpa` varchar(250) DEFAULT NULL,
  `policy_start_date` date DEFAULT NULL,
  `policy_expiry_date` date DEFAULT NULL,
  `village` varchar(255) DEFAULT NULL,
  `cat` varchar(255) DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `age` varchar(20) DEFAULT NULL,
  `relation` varchar(255) DEFAULT NULL,
  `person` varchar(50) DEFAULT NULL,
  `sum_insured` varchar(255) DEFAULT NULL,
  `comulative_bonus` varchar(50) DEFAULT NULL,
  `joining_year` varchar(50) DEFAULT NULL,
  `basic_premium_ps` varchar(50) DEFAULT NULL,
  `policy_cheque_no` varchar(255) DEFAULT NULL,
  `bank` varchar(255) DEFAULT NULL,
  `account_no` varchar(255) DEFAULT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `name_as_per_cheque` varchar(200) DEFAULT NULL,
  `ifsc` varchar(255) DEFAULT NULL,
  `not_over` varchar(200) DEFAULT NULL,
  `cheque_date` date DEFAULT NULL,
  `cheque_status` varchar(50) DEFAULT '''DISHONOURED'',''CLEARED''',
  `reason_dishonoured` varchar(50) DEFAULT NULL,
  `vkk_premium` varchar(255) DEFAULT NULL,
  `co_premium` varchar(50) DEFAULT NULL,
  `gross_premium` varchar(250) DEFAULT NULL,
  `commission` varchar(250) DEFAULT NULL,
  `two_lakh_f` varchar(255) DEFAULT NULL,
  `policy_holder_premium` varchar(250) DEFAULT NULL,
  `Gaam_mahajan_vkk_refund` varchar(250) DEFAULT NULL,
  `excess_short_amt` varchar(250) DEFAULT NULL,
  `diff_amt_paid_policy_holder` varchar(250) DEFAULT NULL,
  `loan_status` varchar(50) DEFAULT '''no'',''yes''',
  `loan_amt` varchar(250) DEFAULT NULL,
  `nominee_name` varchar(255) DEFAULT NULL,
  `nominee_relation` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `address_two` varchar(250) DEFAULT NULL,
  `address_three` varchar(250) DEFAULT NULL,
  `address_four` varchar(250) DEFAULT NULL,
  `area` varchar(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `pincode` varchar(10) DEFAULT NULL,
  `mobile_first` varchar(250) DEFAULT NULL,
  `mobile_second` varchar(15) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `refund_cheque_amt` varchar(255) DEFAULT NULL,
  `cheque_no` varchar(50) DEFAULT NULL,
  `refund_cheque_date` date DEFAULT NULL,
  `cd_account_status` varchar(50) DEFAULT '''no'',''yes''',
  `cd_amount` varchar(200) DEFAULT NULL,
  `not_courier` varchar(255) DEFAULT NULL,
  `courier_date` date DEFAULT NULL,
  `courier_address` longtext DEFAULT NULL,
  `remark` text DEFAULT NULL,
  `ref_no` varchar(255) NOT NULL,
  `year` varchar(255) DEFAULT NULL,
  `month` longtext DEFAULT NULL,
  `policy_grouping` varchar(250) DEFAULT NULL,
  `url` varchar(250) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `policy_table`
--

INSERT INTO `policy_table` (`policy_no`, `policy_type`, `customer_id`, `svvk_id`, `policy_holder`, `pan_no`, `company`, `tpa`, `policy_start_date`, `policy_expiry_date`, `village`, `cat`, `dob`, `age`, `relation`, `person`, `sum_insured`, `comulative_bonus`, `joining_year`, `basic_premium_ps`, `policy_cheque_no`, `bank`, `account_no`, `branch`, `name_as_per_cheque`, `ifsc`, `not_over`, `cheque_date`, `cheque_status`, `reason_dishonoured`, `vkk_premium`, `co_premium`, `gross_premium`, `commission`, `two_lakh_f`, `policy_holder_premium`, `Gaam_mahajan_vkk_refund`, `excess_short_amt`, `diff_amt_paid_policy_holder`, `loan_status`, `loan_amt`, `nominee_name`, `nominee_relation`, `address`, `address_two`, `address_three`, `address_four`, `area`, `city`, `pincode`, `mobile_first`, `mobile_second`, `email`, `refund_cheque_amt`, `cheque_no`, `refund_cheque_date`, `cd_account_status`, `cd_amount`, `not_courier`, `courier_date`, `courier_address`, `remark`, `ref_no`, `year`, `month`, `policy_grouping`, `url`) VALUES
('PO- 14010034242800004960:', 'Family-Floater', 'ME04872192', 'RTYFEB0001', 'Gaurav Shantilal Gala', 'BUKPG5169H', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-20', '2026-02-19', 'Lakadia', 'D', '1993-01-25', '32', 'Self', '2', '500000', '250000', '16.02.2016', '6236', 'CH- 128108', 'State Bank of India', 'A/C- 10378858205', 'Mumbai - 400097', 'Shantaben Shantilal Gala', 'SBIN0003110', '32000', '2025-01-15', 'CLEARED ', '', '30075', '30075', '25487', '3823', '30075', '30075', '', '', '', 'NO', '', 'Shantaben Shantilal Gala', 'Mother', 'Flat no. 10/3, Sonal Apt.,', 'Machubhai Road, Near Fatima High School,', 'Pushpa Colony,', '', 'Malad-East', 'Mumbai', '400097', '9167301616', '9619111421', '', '', '', '0000-00-00', '', '', 'YES', '2025-04-19', 'Same', '', 'RTY2024FEB0001', '2024-25', 'February', 'RTY', ''),
('PO- 14010034249500008083:', 'Individual', 'PO87354747', 'RTYFEB0002', 'Vasantkumar Meghji Faria', 'AAAPF0620P', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-23', '2026-02-22', 'Bhachau', 'D', '1954-05-04', '70', 'Self', '1', '700000', '350000', '23.02.2018', '0', 'CH- 000862', 'ICICI Bank', 'A/C- 623705021579', 'Mumbai - 400019', 'Shriya Enterprise', 'ICIC0006237', '65000', '2025-01-23', 'CLEARED ', '', '62708', '62708', '53142', '7971', '62708', '62708', '', '', '', 'NO', '', 'Ojas Vasant Faria', 'Son', '18, Bhoj Terrace, 2nd Floor,', 'Tejookaya Park,', 'Sr. Ambedkar Road,', '', 'Matunga', 'Mumbai', '400019', '9920454450', '9821678087', 'vasantkumarfaria@gmail.com', '', '', '0000-00-00', '', '', 'YES', '2025-04-19', '', '', 'RTY2024FEB0002', '2024-25', 'February', 'RTY', ''),
('PO- 14010034249500008082:', 'Individual', 'PO32636596', 'RTYFEB0003', 'Ramilaben Lalji Chheda', 'BDJPC1850K', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-20', '2026-02-19', 'Bhachau', 'C', '1963-01-01', '62', 'Self', '1', '100000', '0', '16.02.2015', '0', ' Cash', 'Bank of Baroda', 'A/C- 58580100028329', 'Bhachau-370140', 'Ramilaben Laljibhai Chheda', 'BARB0BHAKUT', '2000', '2025-01-25', 'CLEARED ', '', '17009', '17010', '14415', '2162', '17010', '2000', '15010', '', '', 'NO', '', 'Zaverben Chiman Satra', 'Others', '00, Jain Dharmshala,', 'Nr. Doctor Lalit Hospital , ', 'Bharuch, Kutch, ', '', 'Kutch', 'Gujarat', '370140', '9967190748', '8469798290', 'deveshgada35@gmail.com', '', '', '0000-00-00', 'YES', '17010', 'NO', '2025-04-18', 'C/O-Bharat Narshi Dedhia, Bldg. No.23, 703, Ratna Co-op Hsg. Soc., Opp. Pant Nagar Mahila Mandal,', 'Policy Given', 'RTY2024FEB0003', '2024-25', 'February', 'RTY', ''),
('PO- 14010034249500008583:', 'Individual', 'PO87363275', 'RTYFEB0004', 'Meet Vinod Nishar', 'AREPN3308B', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-25', '2026-02-24', 'Adhoi', 'D', '1994-06-14', '30', 'Self', '1', '500000', '250000', '25.02.2019', '8189', 'CH- 425551', 'The Cosmos Co. Op. Bank Ltd.', 'A/C- 0240501045021', 'Mumbai - 400092', 'Meet Vinod Nishar', 'COSB0000024', '12000', '2025-01-31', 'CLEARED ', '', '9663', '9663', '8189', '1228', '9663', '9663', '', '', '', 'NO', '', 'Manjula Vinod Nishar', 'Mother', 'Flat No.1, 1st Flr, Prathamesh ,', 'Chandavarkar Road,', 'R.S.Lane,', 'Nr. N.M.Medical,', 'Borivali-West', 'Mumbai', '400092', '9820803090', '', 'vinodnisharv@gmail.com', '', '', '0000-00-00', '', '', 'YES', '2025-10-29', '701, Chrismaa Enclave, Dharamdas Lane, L.T.Road, B/H Laxmi chhaya, Ekshar Road, Borivali-W, Mumbai-400092', '', 'RTY2024FEB0004', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005205:', 'Family-Floater', 'PO87361649', 'RTYFEB0005', 'Manjula Vinod Nishar', 'AAAPN5958N', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-25', '2026-02-24', 'Adhoi', 'D', '1970-08-22', '54', 'Self', '2', '500000', '125000', '25.02.2019', '19892', 'CH- 100046', 'Janseva Sahakari Bank Ltd.', 'A/C- 001022100022281', 'Mumbai - 400092', 'Manjula Vinod Nisar', 'JASB0000002', '51000', '2025-01-31', 'CLEARED ', '', '49315', '49315', '41793', '6269', '49315', '49315', '', '', '', 'NO', '', 'Vinod Nishar', 'Spouse', 'Flat No.1, 1st Flr, Prathamesh ,', 'Chandavarkar Road,', 'R.S.Lane,', 'Nr. N.M.Medical,', 'Borivali-West', 'Mumbai', '400092', '9820803090', '', 'vinodnisharv@gmail.com', '', '', '0000-00-00', '', '', 'YES', '2025-04-19', ' 701, Chrismaa Enclave, Dharamdas Lane, L.T.Road, B/H Laxmi chhaya, Ekshar Road, Borivali-W, Mumbai-400092', '', 'RTY2024FEB0005', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242700000315:', 'Asha-Kiran', 'PO87363842', 'RTYFEB0006', 'Rajesh Khimji Chhadwa', 'AICPC8903C', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-21', '2026-02-20', 'Samkhiyali', 'B', '1984-09-28', '40', 'Self', '4', '200000', '0', '16.02.2017', '1075', 'CH- 000102', 'Bank Of Baroda', 'A/C- 03960100009552', 'Mumbai - 400007', 'Rajesh Khimji Chhadwa', 'BARB0GAMDEV', '12000', '2025-02-01', 'CLEARED ', '', '11577', '11577', '9811', '1472', '11577', '5789', '5788', '', '', 'NO', '', 'Prabhavati Rajesh Chhadwa', 'Spouse', 'Room No. 8,', ' Jayaben Chawl,', ' Carter Road No. 3,', ' Nr. Shivdham Temple, ', 'Borivali-East', 'Mumbai', '400007', '8655656028', '', 'chhadva123rajesh@gmail.com', '5788', '960066', '2025-09-03', '', '', 'NO', '2025-05-05', '', 'Policy Given', 'RTY2024FEB0006', '2024-25', 'February', 'RTY', ''),
('PO- 14010034249500008584:', 'Individual', 'PO95120067', 'RTYFEB0007', 'Karan Vijay Furia', 'ABOPF9825A', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-16', '2026-02-15', 'Bhachau', 'D', '1994-01-25', '31', 'Self', '1', '200000', '100000', '16.02.2022', '6266', 'CH- 000031', 'Bank of Baroda', 'A/C- 20260100020105', 'Mumbai - 400092', 'Karan V Furia', 'BARB0SHIBOR', '8000', '2025-02-01', 'CLEARED ', '', '7394', '7394', '6266', '940', '7394', '7394', '', '', '', 'NO', '', 'Meena Vijay Furiya', 'Mother', 'Room No. 2,', ' Saidham Wadekar Chawl, ', 'Shimpoli Road,', ' Nr. MTNL,', 'Borivali-West', 'Mumbai', '400092', '9967990143', '7977715164', 'kfuria253@gmail.com', '', '', '0000-00-00', '', '', 'YES', '2025-04-19', '', '', 'RTY2024FEB0007', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005206:', 'Family-Floater', 'POA3169616', 'RTYFEB0008', 'Paresh Devshi Satra', 'BLNPS4556A', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-15', '2026-02-14', 'Adhoi', 'B', '1980-10-26', '44', 'Self', '2', '200000', '50000', '15.02.2023', '0', 'CH- 000016', 'Uco bank', 'A/C- 09240110062883', 'Mumbai-400101', 'Paresh D. Satra', 'UCBA0000924', '20000', '2025-02-03', 'CLEARED ', '', '16166', '16166', '13700', '2055', '16166', '8083', '8083', '', '', 'NO', '', 'Laxmi Paresh Satra', 'Spouse', 'C-410, Satlaj Apartment, sahakargra,', 'Ashokchakravarti Road,', '', '', 'Kandivali-West', 'Mumbai', '400101', '7506012688', '', 'pareshsatra0@gmail.com', '8083', '040717', '2025-04-08', '', '', '', '0000-00-00', '', '', 'RTY2024FEB0008', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005207:', 'Family-Floater', 'PO95157372', 'RTYFEB0009', 'Arvind Umarshi Fariya', 'AAEPF3931H', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-21', '2026-02-20', 'Bhachau', 'D', '1977-09-03', '47', 'Self', '2', '500000', '250000', '21.02.2022', '12876', 'CH- 833537', 'Bank of Maharashtra', 'A/C- 60008636406', 'Mumbai - 400064', 'Arvind Umarshi Fariya', 'MAHB0000117', '52000', '2025-02-03', 'DISHONOURED', '', '50264', '50264', '42596', '6389', '50264', '50264', '', '', '', 'NO', '', 'Priti Arvind Fariya', 'Spouse', '12, Sundaram CHS Ltd.,', ' Plot No. 55,', ' Ramchandra Lane,', ' Nr. Witty Kids School, ', 'Mahim-West', 'Mumbai', '400064', '9820911469', '', 'sai7deepak@gmail.com', '', '', NULL, NULL, '', 'YES', '2025-04-19', '402, Maitry Residency, 6th maletdar Wadi,Nr. Gariba Hospital, malad-W, Mumbai-400064', '', 'RTY2024FEB0009', '2024-25', 'February', 'RTY', ''),
('PO- 14010034249500008586:', 'Individual', 'PO95126013', 'RTYFEB0010', 'Ritika Shamji Dedhia', 'AMWPD6514A', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-16', '2026-02-15', 'Manafara', 'D', '1982-10-18', '42', 'Self', '1', '500000', '250000', '16.02.2022', '11714', 'CH- 242581', 'State Bank of India', 'A/C- 33944971690', 'Mumbai - 400056', 'Ritika Shamji Dedhia', 'SBIN0017415', '15000', '2025-02-03', 'CLEARED ', '', '13822', '13822', '11714', '1757', '13822', '13822', '', '', '', 'NO', '', 'Shamji Premji Dedhia', 'Father', '9/A, Prabhudas Bldg.,', ' St. Xavier School Road,', ' Opp. St. Xavier Church,', '', 'Vileparle-West', 'Mumbai', '400056', '9769278976', '', 'ritikadedhia1982@gmail.com', '', '', '0000-00-00', '', '', 'NO', '0000-00-00', '', 'Policy Given', 'RTY2024FEB0010', '2024-25', 'February', 'RTY', ''),
('PO- 14010034249500008606:', 'Individual', 'PO87353723', 'RTYFEB0011', 'Damji Harakhchand Chhadva', 'ADAPC4430F', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-23', '2026-02-22', 'Samkhiyali', 'C', '1946-12-25', '78', 'Self', '1', '100000', '0', '23.02.2018', '20340', 'CH- 000020', 'HDFC Bank', 'A/C- 50100360895099', 'Nallasopara-W', 'Damji Harakhchand Chhadva', 'HDFC0000662', '2000', '2025-02-01', 'CLEARED ', '', '24002', '24002', '20340', '3051', '24002', '2000', '22002', '', '', 'NO', '', 'Nitin Damji Chhadwa', 'Son', 'A-712, Panbai Nagar,', 'Shree Prastha Road No.2,', 'Nr. Viva Super Market,', '', 'Nallasopara-West', 'Thane', '401203', '8097219022', '9867805320', 'chhadvaanjali@gmail.com', '', '', '0000-00-00', 'YES', '24002', 'NO', '2025-04-21', '', 'Policy Given', 'RTY2024FEB0011', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005224:', 'Family-Floater', 'PO07302729', 'RTYFEB0012', 'Deepak Ravji Gada', 'AVEPG5953B', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-20', '2026-02-19', 'Thoriari', 'C', '1978-02-07', '47', 'Self', '2', '200000', '100000', '15.02.2011', '9621', 'CH- 000008', 'Kotak Mahendra Bank', 'A/C- 3114042058', 'Vasai - 401202', 'Deepak Ravjibhai Gada', 'KKBK0001420', '4000', '2025-02-10', 'CLEARED ', '', '14984', '14984', '12698', '1905', '14984', '4000', '10984', '', '', 'NO', '', 'Purvi Gada', 'Spouse', 'C - 20, Room No. 4, 1st Floor,', ' Ketki CHS, Dewan & Shah Enclave,', ' Opp. Kalpana Life Line Hospital,', '', 'Vasai-West', 'Palghar', '401202', '8286591020', '', 'deepakgada721978@gmail.com', '', '', '0000-00-00', 'YES', '14984', 'YES', '2025-04-19', '', '', 'RTY2024FEB0012', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005209:', 'Family-Floater', 'PO87360848', 'RTYFEB0013', 'Sanjay Ramjibhai Shah', 'BDHPS3707D', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-25', '2026-02-24', 'Adhoi', 'D', '1983-11-14', '41', 'Self', '4', '500000', '125000', '25.02.2019', '9461', 'CH- 834468', 'Punjab National Bank', 'A/C- 1317001700007443', 'Mumbai - 400092', 'Sanjay R Shah', 'PUNB0131700', '30000', '2025-02-08', 'CLEARED ', '', '28640', '28640', '24272', '3641', '28640', '28640', '', '', '', 'NO', '', 'Jayshree Sanjay Shah', 'Spouse', 'C/401, Jinal CHS Ltd.,', ' Thakur Complex,', ' Nr. Ramdas Kadam Bunglow, ', '', 'Kandivali-East', 'Mumbai', '400101', '9664728286', '', 'sanjayrshah6488@gmail.com', '', '', '0000-00-00', '', '', 'YES', '2025-04-22', '', '', 'RTY2024FEB0013', '2024-25', 'February', 'RTY', ''),
('PO- 14010034249500008605:', 'Individual', 'ME13103229', 'RTYFEB0014', 'Panbai Nensi Gada', 'AKCPG1197Q', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-23', '2026-02-22', 'Samkhiyali', 'C', '1953-08-06', '71', 'Self', '1', '100000', '0', '23.02.2018', '17203', 'CH- 045973', 'Bharat Bank', 'A/C- 006210100029319', 'Nallasopara', 'Panbai Nensi Gada', 'BCBM0000063', '2000', '2025-02-07', 'CLEARED ', '', '20299', '20299', '17203', '2580', '20299', '2000', '18299', '', '', 'NO', '', 'Bhavin Nenshi Gada', 'Son', 'Room No.132, C-wing,', 'Panbai Nagar,', 'Shree Prasth Road No.2,', 'Nr. Viva Super Market,', 'Nallasopara-West', 'Thane', '401203', '9730178370', '9892715594', 'bhavingada864@gmail.com', '', '', '0000-00-00', 'YES', '20299', 'YES', '2025-04-19', '', '', 'RTY2024FEB0014', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005215:', 'Family-Floater', 'PO87352925', 'RTYFEB0015', 'Bhavin Nenshi Gada', 'AKCPG1196R', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-28', '2026-02-27', 'Samkhiyali', 'B', '1983-03-08', '41', 'Self', '4', '200000', '100000', '28.02.2018', '7093', 'CH- 056425', 'Bharat Bank', 'A/C- 006210100008666', 'Nallasopara', 'Bhavin Nensi Gada', 'BCBM0000063', '21000', '2025-02-07', 'CLEARED ', '', '19221', '19221', '16289', '2443', '19221', '19221', '9610', '', '', 'NO', '', 'Panbai Nenshi Gada', 'Mother', 'Room No.132, C-wing,', 'Panbai Nagar,', 'Shree Prasth Road No.2,', 'Nr. Viva Super Market,', 'Nallasopara-West', 'Thane', '401203', '9730178370', '9892715594', 'bhavingada864@gmail.com', '9610', '960067', '2025-09-03', '', '', 'YES', '2025-10-04', '', '', 'RTY2024FEB0015', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005223:', 'Family-Floater', 'ME13226933', 'RTYFEB0016', 'Hardik Navin Gala', 'BQUPG1183K', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-03-04', '2026-03-03', 'Bharudia', 'C', '1997-04-15', '27', 'Self', '2', '200000', '100000', '16.02.2017', '4443', 'CH- 000014', 'Bank of Baroda', 'A/C- 04240100022176', 'Thane - 400602', 'Hjardik Navin Gala', 'BARB0THANAX', '4000', '2025-02-07', 'CLEARED ', '', '22449', '22449', '19025', '2854', '22449', '4000', '18449', '', '', 'NO', '', 'Navin Akha Gala', 'Father', '803, Shanti Heights, Ayre Road,Nr. Swami Vivekanand School,', '', '', '', 'Dombivali-East', 'Thane', '421201', '7045507635', '8652855401', 'galahardik00@gmail.com', '', '', '0000-00-00', 'YES', '22449', 'YES', '2025-04-19', '', '', 'RTY2024FEB0016', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005214:', 'Family-Floater', 'PO87362252', 'RTYFEB0017', 'Jigna Pravin Gada', 'AJJPG2516R', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-25', '2026-02-24', 'Samkhiyali', 'D', '1976-12-16', '48', 'Self', '4', '1000000', '500000', '25.02.2019', '18263', 'CH- 179961', 'Cosmos Bank', 'A/C- 023050101700', 'Mumbai - 400067', 'Jigna Pravin Gada', 'COSB0000023', '50000', '2025-02-07', 'CLEARED ', '', '48445', '48445', '41055', '6158', '48445', '48445', '', '', '', 'NO', '', 'Pravin Kunvarji Gada', 'Spouse', 'A-202, Vibhako Bldg,', 'Arihant Galaxy CHS,', 'Mamladar Wadi, Main Road,', 'Opp. Rd No.1,', 'Malad-West', 'Mumbai', '400064', '9821026774', '', 'pravingada79@gmail.com', '', '', '0000-00-00', '', '', 'NO', '2025-05-12', '', 'Policy Given', 'RTY2024FEB0017', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005222:', 'Family-Floater', 'ME01518699', 'RTYFEB0018', 'Karan Suresh Visaria', 'ATJPV5322N', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-20', '2026-02-19', 'Bhachau', 'C', '1995-06-27', '29', 'Self', '3', '200000', '100000', '16.02.2012', '4548', 'CH- 000001', 'AU Small Finance Bank', 'A/C- 2501266564879122', 'Mumbai - 400022', 'Karan Suresh Visaria', 'AUBL0002665', '6000', '2025-02-06', 'CLEARED ', '', '42637', '42637', '36133', '5420', '42637', '6000', '36637', '', '', 'NO', '', 'Amita Suresh Visaria', 'Mother', 'T/29, Shiv Kripa, 3rd Floor,', 'R. No. 314, Sion Koliwada,', 'Pratiksha Nagar, ', '', 'Sion', 'Mumbai', '400022', '9969686084', '8097170409', 'visaria72@gmail.com', '', '', '0000-00-00', 'YES', '42637', 'YES', '2025-04-19', '', '', 'RTY2024FEB0018', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005213:', 'Family-Floater', 'PO87355194', 'RTYFEB0019', 'Bhavana Mayur Gala', 'BPIPG4296Q', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-26', '2026-02-25', 'Trambau', 'B', '1985-06-05', '39', 'Self', '4', '200000', '100000', '26.02.2019', '6566', 'CH- 000038', 'Bank of Baroda', 'A/C- 04180100026451', 'Mumbai - 400002', 'Bhavana Mayur Gala', 'BARB0THAKUR', '22000', '2025-02-12', 'CLEARED ', '', '20504', '20504', '17376', '2606', '20504', '10252', '10252', '', '', 'NO', '', 'Mayur Mulji Gala', 'Spouse', '19 , Krishna Niwas , 1 St Flr,', 'Room No.7 , 2 Nd Fanaswadi,', 'Dadi Seth Agyari Lane,', 'Chira Bazar , ', 'Kalbadevi', 'Mumbai', '400002', '9167879717', '9833484040', 'mayurgala277@gmail.com', '10252', '040721', '2025-04-18', '', '', 'NO', '2025-04-22', '', 'Policy Given', 'RTY2024FEB0019', '2024-25', 'February', 'RTY', ''),
('PO- 14010034249500008607:', 'Individual', 'PO87688319', 'RTYFEB0020', 'Meena Malshi Shah', 'AAVPS7979M', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-25', '2026-02-24', 'Adhoi', 'C', '1961-06-19', '63', 'Self', '1', '100000', '0', '25.02.2019', '14929', 'CH- 514830', 'Central Bank of India', 'A/C- 5130004680', 'Mumbai - 400059', 'Meena Malshi Shah', 'CBIN0281332', '2000', '2025-02-06', 'CLEARED ', '', '17617', '17617', '14929', '2239', '17617', '2000', '15617', '', '', 'NO', '', 'Kaajol Ramesh Gada', 'Daughter', 'Opp. Kohinoor Hotel , ', 'B-4/504, Greenland Apt. ,', 'J.B.Nagar,', '', 'Andheri-East', 'Mumbai', '400059', '9769128680', '', 'furiyamina@gmail.com', '', '', '0000-00-00', 'YES', '17617', 'YES', '2025-04-19', '', '', 'RTY2024FEB0020', '2024-25', 'February', 'RTY', ''),
('PO- 14010034242800005212:', 'Family-Floater', 'PO07275612', 'RTYFEB0021', 'Deepak Chapsi Nisar', 'ALGPN8165Q', 'The New India Assurance Co. LTD.', 'MD India Health Insurance TPA PVT. Limited', '2025-02-25', '2026-02-24', 'Ghanithar', 'B', '1980-06-01', '44', 'Self', '4', '200000', '100000', '16.02.2011', '8121', 'CH- 100107', 'Abhyudaya Co.Op.Bank Ltd', 'A/C- 095011100003612', 'Vasai - 40103', 'Deepak Chapshi Nisar', 'ABHY0065059', '20000', '2025-02-06', 'CLEARED ', '', '18758', '18758', '15896', '2384', '18758', '9379', '9379', '', '', 'NO', '', 'Kavita Deepak Nisar', 'Spouse', 'A-214, Panbai Nagar, ', 'Near Viva Super Market,', '', '', 'Nallasopara-West', 'Thane', '401203', '8390374527', '', 'nisardeepak866@gmail.com', '9379', '040722', '2025-04-18', '', '', 'NO', '2025-04-24', '', 'Policy Given', 'RTY2024FEB0021', '2024-25', 'February', 'RTY', ''),

-- --------------------------------------------------------

--
-- Table structure for table `suminsured`
--

CREATE TABLE `suminsured` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `suminsured`
--

INSERT INTO `suminsured` (`id`, `name`) VALUES
(1, '10l');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `name` varchar(50) DEFAULT NULL,
  `email` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(50) NOT NULL DEFAULT '''admin'',''agent''',
  `reset_token` varchar(255) DEFAULT NULL,
  `token_expiry` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`, `reset_token`, `token_expiry`, `created_at`) VALUES
(1, 'kiran', 'rknishar@gmail.com', 'admin', 'admin', NULL, NULL, '2025-09-09 06:46:37'),
(9, 'Svkk Vagad', 'info@vagad.org', '$2y$10$g1XHs98kvpfyMbJxMdbpcedctdQFrit1zpurSYxfQ6iusZ3MH51pi', 'agent', NULL, NULL, '2025-10-12 10:08:00'),
(11, 'Ramesh', 'hande.ramesh24@gmail.com', '$2y$10$YtNxyPXxGvvg85ybYTCnh.QW675HaI60NfsIHG9NV0rBRSwNVpfiq', 'agent', '974be6c894ae8f5a5139816bb3edd3ab', '2025-10-28 11:41:16', '2025-10-28 10:40:43'),
(12, 'PUJA GALA', 'mediclaim@vagad.org', '$2y$10$5fAYSZIAPAkEJ0/vj9BS0ugAEDGoBEcHx804KV4JdRxOKdhoVIvDm', 'admin', NULL, NULL, '2026-01-02 08:07:01');

-- --------------------------------------------------------

--
-- Table structure for table `village`
--

CREATE TABLE `village` (
  `id` int(11) NOT NULL,
  `name` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `village`
--

INSERT INTO `village` (`id`, `name`) VALUES
(1, 'Mumbai');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `area`
--
ALTER TABLE `area`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `category`
--
ALTER TABLE `category`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `cdloanstatus`
--
ALTER TABLE `cdloanstatus`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `chequestatus`
--
ALTER TABLE `chequestatus`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `city`
--
ALTER TABLE `city`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `courierstatus`
--
ALTER TABLE `courierstatus`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `loanstatus`
--
ALTER TABLE `loanstatus`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `member`
--
ALTER TABLE `member`
  ADD PRIMARY KEY (`m_id`),
  ADD KEY `ref_no` (`ref_no`);

--
-- Indexes for table `pincode`
--
ALTER TABLE `pincode`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `policygroup`
--
ALTER TABLE `policygroup`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `policytype`
--
ALTER TABLE `policytype`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `policy_table`
--
ALTER TABLE `policy_table`
  ADD PRIMARY KEY (`ref_no`);

--
-- Indexes for table `suminsured`
--
ALTER TABLE `suminsured`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `village`
--
ALTER TABLE `village`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `area`
--
ALTER TABLE `area`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `category`
--
ALTER TABLE `category`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `cdloanstatus`
--
ALTER TABLE `cdloanstatus`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `chequestatus`
--
ALTER TABLE `chequestatus`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `city`
--
ALTER TABLE `city`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `member`
--
ALTER TABLE `member`
  MODIFY `m_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2215;

--
-- AUTO_INCREMENT for table `policygroup`
--
ALTER TABLE `policygroup`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `village`
--
ALTER TABLE `village`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `member`
--
ALTER TABLE `member`
  ADD CONSTRAINT `member_ibfk_1` FOREIGN KEY (`ref_no`) REFERENCES `policy_table` (`ref_no`) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
